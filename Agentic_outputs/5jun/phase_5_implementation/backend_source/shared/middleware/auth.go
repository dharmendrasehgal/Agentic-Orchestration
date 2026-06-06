// Package middleware provides shared Gin middleware for DCMS services.
package middleware

import (
	"crypto/rsa"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Claims represents the JWT payload decoded from an access token.
type Claims struct {
	UserID string   `json:"sub"`
	OrgID  string   `json:"org_id"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

// contextKey is an unexported type used for context keys to avoid collisions.
type contextKey string

const (
	// ClaimsKey is the context key under which validated JWT claims are stored.
	ClaimsKey contextKey = "claims"
)

// JWTConfig holds the configuration required by the JWT middleware.
type JWTConfig struct {
	// PublicKey is the RSA public key used to verify RS256-signed tokens.
	PublicKey *rsa.PublicKey
}

// Authenticate returns a Gin middleware that validates RS256 JWT Bearer tokens.
//
// On success the decoded *Claims are stored in the Gin context under "claims".
// The handler chain continues only when the token is present and valid.
//
// Error responses:
//   - 401 Unauthorized — missing or malformed Authorization header, invalid signature
//   - 403 Forbidden    — token present but expired
func Authenticate(cfg JWTConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, err := extractBearerToken(c.GetHeader("Authorization"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing or malformed Authorization header",
			})
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return cfg.PublicKey, nil
		})

		if err != nil {
			// Distinguish expired tokens from other validation failures.
			if errors.Is(err, jwt.ErrTokenExpired) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"error": "token expired",
				})
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid token",
			})
			return
		}

		if !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid token",
			})
			return
		}

		c.Set(string(ClaimsKey), claims)
		c.Next()
	}
}

// RequireRole returns a Gin middleware that enforces that the authenticated
// user holds at least one of the supplied roles. Authenticate must run before
// this middleware so that claims are already present in the context.
//
// Returns 403 Forbidden when the role check fails.
func RequireRole(roles ...string) gin.HandlerFunc {
	required := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		required[r] = struct{}{}
	}

	return func(c *gin.Context) {
		claims, ok := ClaimsFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthenticated",
			})
			return
		}

		for _, userRole := range claims.Roles {
			if _, allowed := required[userRole]; allowed {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "insufficient permissions",
		})
	}
}

// ClaimsFromContext retrieves validated JWT claims from the Gin context.
// Returns nil, false if the middleware has not run or the token was invalid.
func ClaimsFromContext(c *gin.Context) (*Claims, bool) {
	val, exists := c.Get(string(ClaimsKey))
	if !exists {
		return nil, false
	}
	claims, ok := val.(*Claims)
	return claims, ok
}

// extractBearerToken parses "Bearer <token>" from the Authorization header value.
func extractBearerToken(header string) (string, error) {
	if header == "" {
		return "", errors.New("authorization header is empty")
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return "", errors.New("authorization header format must be 'Bearer <token>'")
	}
	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", errors.New("bearer token is empty")
	}
	return token, nil
}
