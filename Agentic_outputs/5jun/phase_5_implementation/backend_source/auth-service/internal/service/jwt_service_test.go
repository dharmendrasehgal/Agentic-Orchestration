// Package service_test contains unit tests for the JWT service.
// Tests generate an in-memory RSA key pair rather than reading from disk so
// that they run without any external file system state.
package service_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"dcms/auth-service/internal/model"
	"dcms/auth-service/internal/service"
)

// --------------------------------------------------------------------------
// Test fixtures
// --------------------------------------------------------------------------

// keyPairFixture holds paths to temporary PEM files used by the JWT service.
type keyPairFixture struct {
	PrivateKeyPath string
	PublicKeyPath  string
	PrivateKey     *rsa.PrivateKey
}

// newKeyPairFixture generates a 2048-bit RSA key pair and writes both keys
// to a temp directory. Returns the fixture and a cleanup function.
func newKeyPairFixture(t *testing.T) keyPairFixture {
	t.Helper()

	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err, "generate RSA key")

	dir := t.TempDir()

	// Write private key (PKCS8 PEM).
	privBytes, err := x509.MarshalPKCS8PrivateKey(privKey)
	require.NoError(t, err)
	privPath := filepath.Join(dir, "private.pem")
	require.NoError(t, os.WriteFile(privPath, pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privBytes,
	}), 0600))

	// Write public key (PKIX PEM).
	pubBytes, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	require.NoError(t, err)
	pubPath := filepath.Join(dir, "public.pem")
	require.NoError(t, os.WriteFile(pubPath, pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	}), 0644))

	return keyPairFixture{
		PrivateKeyPath: privPath,
		PublicKeyPath:  pubPath,
		PrivateKey:     privKey,
	}
}

// newTestJWTService creates a JWTService connected to an in-memory miniredis instance.
func newTestJWTService(t *testing.T, kp keyPairFixture) service.JWTService {
	t.Helper()

	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})

	cfg := service.JWTConfig{
		PrivateKeyPath:  kp.PrivateKeyPath,
		PublicKeyPath:   kp.PublicKeyPath,
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
		Issuer:          "dcms-auth-test",
	}

	svc, err := service.NewJWTService(cfg, rdb, zap.NewNop())
	require.NoError(t, err, "NewJWTService should not error with valid keys")
	return svc
}

// sampleUser returns a populated *model.User for use in token issuance tests.
func sampleUser() *model.User {
	return &model.User{
		ID:            "user-uuid-001",
		OrgID:         "org-uuid-001",
		Email:         "test@example.com",
		Roles:         []string{"operator", "viewer"},
		AccountStatus: model.AccountStatusActive,
	}
}

// --------------------------------------------------------------------------
// TestIssueAccessToken_ContainsClaims
// --------------------------------------------------------------------------

func TestIssueAccessToken_ContainsClaims(t *testing.T) {
	kp := newKeyPairFixture(t)
	svc := newTestJWTService(t, kp)

	user := sampleUser()
	tokenStr, expiresAt, err := svc.IssueAccessToken(user)

	require.NoError(t, err)
	assert.NotEmpty(t, tokenStr)
	assert.False(t, expiresAt.IsZero())

	// Validate the token and inspect claims.
	claims, err := svc.ValidateAccessToken(tokenStr)
	require.NoError(t, err)

	assert.Equal(t, user.ID, claims.UserID, "sub claim should equal user ID")
	assert.Equal(t, user.OrgID, claims.OrgID, "org_id claim should match")
	assert.ElementsMatch(t, user.Roles, claims.Roles, "roles claim should match")
}

// --------------------------------------------------------------------------
// TestIssueAccessToken_ExpiresIn15Minutes
// --------------------------------------------------------------------------

func TestIssueAccessToken_ExpiresIn15Minutes(t *testing.T) {
	kp := newKeyPairFixture(t)
	svc := newTestJWTService(t, kp)

	before := time.Now().UTC()
	_, expiresAt, err := svc.IssueAccessToken(sampleUser())
	after := time.Now().UTC()

	require.NoError(t, err)

	// The expiry should be approximately 15 minutes from now.
	expectedMin := before.Add(14 * time.Minute)
	expectedMax := after.Add(16 * time.Minute)

	assert.True(t, expiresAt.After(expectedMin),
		"expiresAt (%v) should be after %v", expiresAt, expectedMin)
	assert.True(t, expiresAt.Before(expectedMax),
		"expiresAt (%v) should be before %v", expiresAt, expectedMax)
}

// --------------------------------------------------------------------------
// TestValidateAccessToken_ValidToken
// --------------------------------------------------------------------------

func TestValidateAccessToken_ValidToken(t *testing.T) {
	kp := newKeyPairFixture(t)
	svc := newTestJWTService(t, kp)

	tokenStr, _, err := svc.IssueAccessToken(sampleUser())
	require.NoError(t, err)

	claims, err := svc.ValidateAccessToken(tokenStr)
	require.NoError(t, err)
	assert.NotNil(t, claims)
	assert.Equal(t, "user-uuid-001", claims.UserID)
}

// --------------------------------------------------------------------------
// TestValidateAccessToken_ExpiredToken
// --------------------------------------------------------------------------

func TestValidateAccessToken_ExpiredToken(t *testing.T) {
	kp := newKeyPairFixture(t)

	// Create a service with a very short TTL so we can produce an expired token.
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	cfg := service.JWTConfig{
		PrivateKeyPath:  kp.PrivateKeyPath,
		PublicKeyPath:   kp.PublicKeyPath,
		AccessTokenTTL:  -1 * time.Millisecond, // already expired
		RefreshTokenTTL: 7 * 24 * time.Hour,
		Issuer:          "dcms-auth-test",
	}
	svc, err := service.NewJWTService(cfg, rdb, zap.NewNop())
	require.NoError(t, err)

	tokenStr, _, err := svc.IssueAccessToken(sampleUser())
	require.NoError(t, err)

	// Validate the already-expired token.
	claims, err := svc.ValidateAccessToken(tokenStr)
	assert.Error(t, err, "expected error for expired token")
	assert.Nil(t, claims)
	assert.Contains(t, err.Error(), "expired")
}

// --------------------------------------------------------------------------
// TestValidateAccessToken_WrongKey
// --------------------------------------------------------------------------

func TestValidateAccessToken_WrongKey(t *testing.T) {
	// Sign with one key pair, validate with a different one.
	kp1 := newKeyPairFixture(t)
	kp2 := newKeyPairFixture(t)

	mr, _ := miniredis.Run()
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})

	issuer, err := service.NewJWTService(service.JWTConfig{
		PrivateKeyPath:  kp1.PrivateKeyPath,
		PublicKeyPath:   kp1.PublicKeyPath,
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
	}, rdb, zap.NewNop())
	require.NoError(t, err)

	validator, err := service.NewJWTService(service.JWTConfig{
		PrivateKeyPath:  kp2.PrivateKeyPath,
		PublicKeyPath:   kp2.PublicKeyPath,
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
	}, rdb, zap.NewNop())
	require.NoError(t, err)

	tokenStr, _, err := issuer.IssueAccessToken(sampleUser())
	require.NoError(t, err)

	// Validating with the wrong public key must fail.
	claims, err := validator.ValidateAccessToken(tokenStr)
	assert.Error(t, err, "token signed with a different key should not validate")
	assert.Nil(t, claims)
}

// --------------------------------------------------------------------------
// TestIssueAndRevokeRefreshToken
// --------------------------------------------------------------------------

func TestRevokeRefreshToken(t *testing.T) {
	kp := newKeyPairFixture(t)

	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	svc, err := service.NewJWTService(service.JWTConfig{
		PrivateKeyPath:  kp.PrivateKeyPath,
		PublicKeyPath:   kp.PublicKeyPath,
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
		Issuer:          "dcms-auth-test",
	}, rdb, zap.NewNop())
	require.NoError(t, err)

	user := sampleUser()

	// Issue a refresh token.
	refreshToken, err := svc.IssueRefreshToken(user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, refreshToken)

	// Refresh should succeed before revocation.
	ctx := context.Background()
	_, _, err = svc.RefreshAccessToken(ctx, refreshToken)
	require.NoError(t, err, "refresh should succeed before revocation")

	// Revoke it.
	require.NoError(t, svc.RevokeRefreshToken(ctx, refreshToken))

	// Refresh should now fail.
	_, _, err = svc.RefreshAccessToken(ctx, refreshToken)
	assert.Error(t, err, "refresh should fail after revocation")
	assert.ErrorIs(t, err, service.ErrRefreshTokenInvalid)
}

// --------------------------------------------------------------------------
// TestIssueRefreshToken_StoresInRedis
// --------------------------------------------------------------------------

func TestIssueRefreshToken_StoresInRedis(t *testing.T) {
	kp := newKeyPairFixture(t)

	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	svc, err := service.NewJWTService(service.JWTConfig{
		PrivateKeyPath:  kp.PrivateKeyPath,
		PublicKeyPath:   kp.PublicKeyPath,
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 24 * time.Hour,
		Issuer:          "dcms-auth-test",
	}, rdb, zap.NewNop())
	require.NoError(t, err)

	token, err := svc.IssueRefreshToken("user-000")
	require.NoError(t, err)

	// Verify the token is resolvable via RefreshAccessToken.
	// (This implicitly tests Redis storage without direct Redis coupling in the test.)
	ctx := context.Background()
	newToken, expiresAt, err := svc.RefreshAccessToken(ctx, token)
	require.NoError(t, err)
	assert.NotEmpty(t, newToken)
	assert.False(t, expiresAt.IsZero())
}
