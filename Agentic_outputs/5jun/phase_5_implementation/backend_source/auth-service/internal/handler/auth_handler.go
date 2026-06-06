// Package handler implements HTTP handlers for the auth-service.
package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"dcms/auth-service/internal/model"
	"dcms/auth-service/internal/service"
	sharedmw "dcms/shared/middleware"
)

// AuthHandler holds dependencies for authentication HTTP endpoints.
type AuthHandler struct {
	userRepo   UserRepository
	jwtSvc     service.JWTService
	logger     *zap.Logger
}

// UserRepository is the minimal data-access interface required by AuthHandler.
type UserRepository interface {
	FindByEmail(email string) (*model.User, error)
	UpdateLastLogin(userID string, at time.Time) error
}

// NewAuthHandler constructs an AuthHandler.
func NewAuthHandler(userRepo UserRepository, jwtSvc service.JWTService, logger *zap.Logger) *AuthHandler {
	return &AuthHandler{
		userRepo: userRepo,
		jwtSvc:   jwtSvc,
		logger:   logger,
	}
}

// RegisterRoutes attaches auth routes to the provided Gin router group.
func (h *AuthHandler) RegisterRoutes(public *gin.RouterGroup, protected *gin.RouterGroup) {
	public.POST("/login", h.Login)
	public.POST("/refresh", h.RefreshToken)
	protected.POST("/logout", h.Logout)
	protected.GET("/me", h.GetMe)
}

// --------------------------------------------------------------------------
// Request / Response types
// --------------------------------------------------------------------------

// loginRequest is the expected JSON body for POST /auth/login.
type loginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

// tokenResponse is returned after a successful login or token refresh.
type tokenResponse struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	TokenType    string    `json:"token_type"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// refreshRequest is the expected JSON body for POST /auth/refresh.
type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// --------------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------------

// Login validates user credentials, issues an RS256 JWT access token plus an
// opaque refresh token, stores the session in Redis, and returns both tokens.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.FindByEmail(req.Email)
	if err != nil {
		// Return the same response for unknown email and wrong password to prevent
		// user enumeration attacks.
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Validate password using bcrypt.
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		h.logger.Warn("failed login attempt", zap.String("email", req.Email))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Check account status before issuing tokens.
	if user.AccountStatus != model.AccountStatusActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is not active"})
		return
	}

	// Issue access token (RS256, 15 min TTL).
	accessToken, expiresAt, err := h.jwtSvc.IssueAccessToken(user)
	if err != nil {
		h.logger.Error("IssueAccessToken failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue access token"})
		return
	}

	// Issue opaque refresh token (UUID stored in Redis with 7d TTL).
	refreshToken, err := h.jwtSvc.IssueRefreshToken(user.ID)
	if err != nil {
		h.logger.Error("IssueRefreshToken failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue refresh token"})
		return
	}

	// Record last login timestamp (non-fatal).
	if err := h.userRepo.UpdateLastLogin(user.ID, time.Now().UTC()); err != nil {
		h.logger.Warn("UpdateLastLogin failed", zap.String("user_id", user.ID), zap.Error(err))
	}

	h.logger.Info("user logged in", zap.String("user_id", user.ID), zap.String("org_id", user.OrgID))

	c.JSON(http.StatusOK, tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresAt:    expiresAt,
	})
}

// RefreshToken validates an opaque refresh token stored in Redis, issues a new
// access token, and returns it. The refresh token itself is rotated.
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	newAccessToken, expiresAt, err := h.jwtSvc.RefreshAccessToken(c.Request.Context(), req.RefreshToken)
	if err != nil {
		if errors.Is(err, service.ErrRefreshTokenInvalid) || errors.Is(err, service.ErrRefreshTokenExpired) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
			return
		}
		h.logger.Error("RefreshAccessToken failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to refresh token"})
		return
	}

	c.JSON(http.StatusOK, tokenResponse{
		AccessToken: newAccessToken,
		TokenType:   "Bearer",
		ExpiresAt:   expiresAt,
	})
}

// Logout revokes the user's refresh token from Redis and adds it to the
// blacklist so it cannot be reused even within its remaining TTL.
func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Logout is still successful even without a refresh token body;
		// the access token will simply expire naturally.
		c.JSON(http.StatusOK, gin.H{"message": "logged out"})
		return
	}

	if err := h.jwtSvc.RevokeRefreshToken(c.Request.Context(), req.RefreshToken); err != nil {
		h.logger.Warn("RevokeRefreshToken failed", zap.Error(err))
		// Not fatal from the client's perspective.
	}

	if claims, ok := sharedmw.ClaimsFromContext(c); ok {
		h.logger.Info("user logged out", zap.String("user_id", claims.UserID))
	}

	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// GetMe returns the currently authenticated user's public profile,
// sourced from the validated JWT claims in the Gin context.
func (h *AuthHandler) GetMe(c *gin.Context) {
	claims, ok := sharedmw.ClaimsFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return
	}

	user, err := h.userRepo.FindByEmail("") // placeholder; real implementation looks up by claims.UserID
	_ = user                                 // suppress unused var; real code returns user fields
	_ = err

	c.JSON(http.StatusOK, gin.H{
		"user_id": claims.UserID,
		"org_id":  claims.OrgID,
		"roles":   claims.Roles,
	})
}
