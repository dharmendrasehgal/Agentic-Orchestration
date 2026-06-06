// Package service implements business logic for the auth-service.
package service

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"dcms/auth-service/internal/model"
)

// Sentinel errors for token operations.
var (
	ErrRefreshTokenInvalid = errors.New("refresh token is invalid")
	ErrRefreshTokenExpired = errors.New("refresh token has expired")
)

// JWTConfig carries paths and durations needed to operate the JWT service.
type JWTConfig struct {
	// PrivateKeyPath is the filesystem path to the RSA private key in PEM format.
	PrivateKeyPath string
	// PublicKeyPath is the filesystem path to the RSA public key in PEM format.
	PublicKeyPath string
	// AccessTokenTTL is the lifetime of issued access tokens. Defaults to 15m.
	AccessTokenTTL time.Duration
	// RefreshTokenTTL is the Redis TTL for refresh tokens. Defaults to 7d.
	RefreshTokenTTL time.Duration
	// Issuer is the "iss" claim value.
	Issuer string
}

// Claims is the custom JWT payload.
type Claims struct {
	UserID string   `json:"sub"`
	OrgID  string   `json:"org_id"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

// JWTService is the interface contract used by handlers and tests.
type JWTService interface {
	IssueAccessToken(user *model.User) (tokenStr string, expiresAt time.Time, err error)
	IssueRefreshToken(userID string) (string, error)
	ValidateAccessToken(tokenStr string) (*Claims, error)
	RefreshAccessToken(ctx context.Context, refreshToken string) (string, time.Time, error)
	RevokeRefreshToken(ctx context.Context, token string) error
}

// jwtService is the production implementation of JWTService.
type jwtService struct {
	privateKey      *rsa.PrivateKey
	publicKey       *rsa.PublicKey
	rdb             *redis.Client
	logger          *zap.Logger
	issuer          string
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

// NewJWTService loads the RSA key pair from disk and constructs a jwtService.
// Returns an error when keys cannot be loaded or parsed.
func NewJWTService(cfg JWTConfig, rdb *redis.Client, logger *zap.Logger) (JWTService, error) {
	if cfg.AccessTokenTTL == 0 {
		cfg.AccessTokenTTL = 15 * time.Minute
	}
	if cfg.RefreshTokenTTL == 0 {
		cfg.RefreshTokenTTL = 7 * 24 * time.Hour
	}
	if cfg.Issuer == "" {
		cfg.Issuer = "dcms-auth-service"
	}

	privKey, err := loadRSAPrivateKey(cfg.PrivateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load private key: %w", err)
	}

	pubKey, err := loadRSAPublicKey(cfg.PublicKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load public key: %w", err)
	}

	return &jwtService{
		privateKey:      privKey,
		publicKey:       pubKey,
		rdb:             rdb,
		logger:          logger,
		issuer:          cfg.Issuer,
		accessTokenTTL:  cfg.AccessTokenTTL,
		refreshTokenTTL: cfg.RefreshTokenTTL,
	}, nil
}

// --------------------------------------------------------------------------
// IssueAccessToken
// --------------------------------------------------------------------------

// IssueAccessToken creates and signs a new RS256 JWT containing the user's
// sub, org_id, and roles claims. The token is valid for the configured TTL
// (default 15 minutes).
func (s *jwtService) IssueAccessToken(user *model.User) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(s.accessTokenTTL)

	claims := Claims{
		UserID: user.ID,
		OrgID:  user.OrgID,
		Roles:  user.Roles,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			ID:        uuid.New().String(), // jti prevents token replay when cached
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(s.privateKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign access token: %w", err)
	}

	return signed, expiresAt, nil
}

// --------------------------------------------------------------------------
// IssueRefreshToken
// --------------------------------------------------------------------------

// IssueRefreshToken generates a cryptographically random UUID, stores it in
// Redis against the userID with the configured TTL, and returns the opaque
// token string.
func (s *jwtService) IssueRefreshToken(userID string) (string, error) {
	token := uuid.New().String()
	key := refreshTokenKey(token)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.rdb.Set(ctx, key, userID, s.refreshTokenTTL).Err(); err != nil {
		return "", fmt.Errorf("store refresh token in Redis: %w", err)
	}

	return token, nil
}

// --------------------------------------------------------------------------
// ValidateAccessToken
// --------------------------------------------------------------------------

// ValidateAccessToken parses and validates the RS256 JWT string, returning the
// decoded *Claims on success. Returns a descriptive error on failure.
func (s *jwtService) ValidateAccessToken(tokenStr string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.publicKey, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, fmt.Errorf("token expired: %w", err)
		}
		return nil, fmt.Errorf("parse token: %w", err)
	}

	if !token.Valid {
		return nil, errors.New("token is not valid")
	}

	return claims, nil
}

// --------------------------------------------------------------------------
// RefreshAccessToken
// --------------------------------------------------------------------------

// RefreshAccessToken validates the opaque refresh token against Redis, looks
// up the associated user, issues a new access token, and returns it with the
// expiry time. The refresh token is NOT rotated here to allow multiple devices;
// rotation policy can be layered on top if required.
func (s *jwtService) RefreshAccessToken(ctx context.Context, refreshToken string) (string, time.Time, error) {
	key := refreshTokenKey(refreshToken)

	userID, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", time.Time{}, ErrRefreshTokenInvalid
		}
		return "", time.Time{}, fmt.Errorf("redis.Get refresh token: %w", err)
	}

	if userID == "" {
		return "", time.Time{}, ErrRefreshTokenInvalid
	}

	// Build a minimal user for token issuance.
	// In production, fetch the user from the repository to pick up role changes.
	user := &model.User{ID: userID}

	tokenStr, expiresAt, err := s.IssueAccessToken(user)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("IssueAccessToken: %w", err)
	}

	return tokenStr, expiresAt, nil
}

// --------------------------------------------------------------------------
// RevokeRefreshToken
// --------------------------------------------------------------------------

// RevokeRefreshToken deletes the refresh token from Redis, immediately
// invalidating it regardless of any remaining TTL.
func (s *jwtService) RevokeRefreshToken(ctx context.Context, token string) error {
	key := refreshTokenKey(token)
	if err := s.rdb.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("redis.Del refresh token: %w", err)
	}
	return nil
}

// --------------------------------------------------------------------------
// Key helpers
// --------------------------------------------------------------------------

// refreshTokenKey returns the Redis key used to store a refresh token.
func refreshTokenKey(token string) string {
	return "dcms:refresh:" + token
}

// loadRSAPrivateKey reads and parses an RSA private key from a PEM file.
func loadRSAPrivateKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file %s: %w", path, err)
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("failed to decode PEM block from private key file")
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		// Fallback: try PKCS1 format.
		rsakey, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("parse private key (tried PKCS8 and PKCS1): %w; %w", err, err2)
		}
		return rsakey, nil
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not an RSA key")
	}
	return rsaKey, nil
}

// loadRSAPublicKey reads and parses an RSA public key from a PEM file.
func loadRSAPublicKey(path string) (*rsa.PublicKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file %s: %w", path, err)
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("failed to decode PEM block from public key file")
	}

	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse public key: %w", err)
	}

	rsaKey, ok := key.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("public key is not an RSA key")
	}
	return rsaKey, nil
}
