//go:build integration
// +build integration

// Package integration_test contains end-to-end integration tests for the DCMS
// container lifecycle API and authentication flows.
//
// Prerequisites:
//   - Docker daemon accessible by the test process (for testcontainers-go)
//   - Run with: go test -tags=integration -v ./integration_tests/... -timeout 5m
//
// Each test suite spins up real PostgreSQL 16 and Redis 7 containers via
// testcontainers-go and boots a lightweight in-process HTTP server that wires
// together the actual handler, service, repository, and JWT layers. A mock
// gRPC agent client is injected so that Docker daemon interaction is
// deterministic without requiring a live Docker host.
package integration_test

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"
	"go.opentelemetry.io/otel/trace/noop"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	containerhandler "dcms/container-service/internal/handler"
	containermodel "dcms/container-service/internal/model"
	containerrepo "dcms/container-service/internal/repository"
	containersvc "dcms/container-service/internal/service"
	agentv1 "dcms/proto/agent/v1"

	authhandler "dcms/auth-service/internal/handler"
	authmodel "dcms/auth-service/internal/model"
	authsvc "dcms/auth-service/internal/service"
	sharedmw "dcms/shared/middleware"
)

// ---------------------------------------------------------------------------
// Shared test helpers and mocks
// ---------------------------------------------------------------------------

// mockAgentClient is a deterministic stand-in for the real gRPC agent client.
// It records calls and returns configurable responses without touching Docker.
type mockAgentClient struct {
	mu           sync.Mutex
	startCalls   []*agentv1.StartContainerRequest
	stopCalls    []*agentv1.StopContainerRequest
	restartCalls []*agentv1.RestartContainerRequest
	// nextDockerID controls the DockerID returned by StartContainer.
	nextDockerID string
}

func newMockAgentClient() *mockAgentClient {
	return &mockAgentClient{nextDockerID: "sha256:mockabc123"}
}

func (m *mockAgentClient) StartContainer(
	_ context.Context,
	_ string,
	req *agentv1.StartContainerRequest,
) (*agentv1.StartContainerResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.startCalls = append(m.startCalls, req)
	id := m.nextDockerID
	if id == "" {
		id = "sha256:" + uuid.New().String()
	}
	return &agentv1.StartContainerResponse{ContainerId: id}, nil
}

func (m *mockAgentClient) StopContainer(
	_ context.Context,
	_ string,
	req *agentv1.StopContainerRequest,
) (*agentv1.StopContainerResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopCalls = append(m.stopCalls, req)
	return &agentv1.StopContainerResponse{}, nil
}

func (m *mockAgentClient) RestartContainer(
	_ context.Context,
	_ string,
	req *agentv1.RestartContainerRequest,
) (*agentv1.RestartContainerResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.restartCalls = append(m.restartCalls, req)
	return &agentv1.RestartContainerResponse{}, nil
}

func (m *mockAgentClient) GetStats(
	ctx context.Context,
	_ string,
	containerID string,
) (<-chan *agentv1.ContainerStats, <-chan error) {
	statsCh := make(chan *agentv1.ContainerStats, 2)
	errCh := make(chan error, 1)

	// Emit two synthetic stat frames then close the channels.
	go func() {
		defer close(statsCh)
		defer close(errCh)
		for i := 0; i < 2; i++ {
			select {
			case <-ctx.Done():
				return
			case statsCh <- &agentv1.ContainerStats{
				ContainerId: containerID,
				CpuPercent:  float64(i+1) * 12.5,
				MemUsageBytes: int64(i+1) * 256 * 1024 * 1024,
			}:
			}
			time.Sleep(100 * time.Millisecond)
		}
	}()

	return statsCh, errCh
}

// mockHostSelector always returns a fixed host, satisfying HostSelector.
type mockHostSelector struct{}

func (s *mockHostSelector) SelectHost(_ context.Context, _, _ interface{}) (string, string, error) {
	return "host-integration-01", "grpc://host-integration-01:50051", nil
}

func (s *mockHostSelector) SelectHostTyped(_ context.Context, _ float64, _ int64) (string, string, error) {
	return "host-integration-01", "grpc://host-integration-01:50051", nil
}

// hostSelectorAdapter bridges the typed interface to containersvc.HostSelector.
type hostSelectorAdapter struct{}

func (a *hostSelectorAdapter) SelectHost(_ context.Context, _ float64, _ int64) (string, string, error) {
	return "host-integration-01", "grpc://host-integration-01:50051", nil
}

// inMemoryUserRepo is a minimal UserRepository backed by a slice for auth tests.
type inMemoryUserRepo struct {
	mu    sync.RWMutex
	users []*authmodel.User
}

func (r *inMemoryUserRepo) FindByEmail(email string) (*authmodel.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

func (r *inMemoryUserRepo) UpdateLastLogin(userID string, at time.Time) error {
	return nil // no-op for tests
}

func (r *inMemoryUserRepo) seed(email, password, role string) *authmodel.User {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	u := &authmodel.User{
		ID:            uuid.New().String(),
		Email:         email,
		PasswordHash:  string(hash),
		OrgID:         uuid.New().String(),
		Roles:         []string{role},
		AccountStatus: authmodel.AccountStatusActive,
	}
	r.mu.Lock()
	r.users = append(r.users, u)
	r.mu.Unlock()
	return u
}

// jwtTestService is a test-only JWTService implementation backed by an
// in-memory RSA key pair rather than key files on disk.
type jwtTestService struct {
	privateKey      *rsa.PrivateKey
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
	rdb             *redis.Client
}

func newJWTTestService(rdb *redis.Client) (*jwtTestService, error) {
	pk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	return &jwtTestService{
		privateKey:      pk,
		accessTokenTTL:  15 * time.Minute,
		refreshTokenTTL: 7 * 24 * time.Hour,
		rdb:             rdb,
	}, nil
}

func (s *jwtTestService) IssueAccessToken(user *authmodel.User) (string, time.Time, error) {
	now := time.Now().UTC()
	exp := now.Add(s.accessTokenTTL)
	claims := authsvc.Claims{
		UserID: user.ID,
		OrgID:  user.OrgID,
		Roles:  user.Roles,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        uuid.New().String(),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := tok.SignedString(s.privateKey)
	return signed, exp, err
}

func (s *jwtTestService) IssueRefreshToken(userID string) (string, error) {
	token := uuid.New().String()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.rdb.Set(ctx, "dcms:refresh:"+token, userID, s.refreshTokenTTL).Err(); err != nil {
		return "", err
	}
	return token, nil
}

func (s *jwtTestService) ValidateAccessToken(tokenStr string) (*authsvc.Claims, error) {
	claims := &authsvc.Claims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return &s.privateKey.PublicKey, nil
	})
	if err != nil {
		return nil, err
	}
	if !tok.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

func (s *jwtTestService) RefreshAccessToken(ctx context.Context, refreshToken string) (string, time.Time, error) {
	userID, err := s.rdb.Get(ctx, "dcms:refresh:"+refreshToken).Result()
	if err != nil {
		return "", time.Time{}, authsvc.ErrRefreshTokenInvalid
	}
	user := &authmodel.User{ID: userID}
	return s.IssueAccessToken(user)
}

func (s *jwtTestService) RevokeRefreshToken(ctx context.Context, token string) error {
	return s.rdb.Del(ctx, "dcms:refresh:"+token).Err()
}

// ---------------------------------------------------------------------------
// ContainerLifecycleSuite
// ---------------------------------------------------------------------------

// ContainerLifecycleSuite exercises the full container lifecycle (create, start,
// stop, delete, list, filter, SSE) against real PostgreSQL and Redis instances.
type ContainerLifecycleSuite struct {
	suite.Suite

	// Infrastructure
	pgContainer    testcontainers.Container
	redisContainer testcontainers.Container
	db             *gorm.DB
	rawDB          *sql.DB
	rdb            *redis.Client

	// Application objects
	agent      *mockAgentClient
	router     *gin.Engine
	httpServer *httptest.Server

	// Auth helpers
	adminToken    string
	viewerToken   string
	defaultNsID   string
}

func TestContainerLifecycleSuite(t *testing.T) {
	suite.Run(t, new(ContainerLifecycleSuite))
}

// SetupSuite starts PostgreSQL and Redis containers, runs migrations,
// seeds test data, and boots the in-process HTTP server.
func (s *ContainerLifecycleSuite) SetupSuite() {
	ctx := context.Background()
	t := s.T()

	// -----------------------------------------------------------------------
	// 1. Start PostgreSQL 16 container
	// -----------------------------------------------------------------------
	pgCtr, err := postgres.RunContainer(ctx,
		testcontainers.WithImage("postgres:16-alpine"),
		postgres.WithDatabase("dcms_test"),
		postgres.WithUsername("dcms"),
		postgres.WithPassword("dcms_secret"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	require.NoError(t, err, "start postgres container")
	s.pgContainer = pgCtr

	pgDSN, err := pgCtr.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	// -----------------------------------------------------------------------
	// 2. Start Redis 7 container
	// -----------------------------------------------------------------------
	redisCtr, err := tcredis.RunContainer(ctx,
		testcontainers.WithImage("redis:7-alpine"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("Ready to accept connections").
				WithStartupTimeout(30*time.Second),
		),
	)
	require.NoError(t, err, "start redis container")
	s.redisContainer = redisCtr

	redisAddr, err := redisCtr.Endpoint(ctx, "")
	require.NoError(t, err)

	// -----------------------------------------------------------------------
	// 3. Connect GORM and Redis clients
	// -----------------------------------------------------------------------
	s.db, err = gorm.Open(gormpostgres.Open(pgDSN), &gorm.Config{})
	require.NoError(t, err, "open gorm connection")

	s.rawDB, err = s.db.DB()
	require.NoError(t, err)

	s.rdb = redis.NewClient(&redis.Options{Addr: redisAddr})
	require.NoError(t, s.rdb.Ping(ctx).Err(), "ping redis")

	// -----------------------------------------------------------------------
	// 4. Run schema migrations (minimal DDL sufficient for integration tests)
	// -----------------------------------------------------------------------
	s.runMigrations()

	// -----------------------------------------------------------------------
	// 5. Wire application layers
	// -----------------------------------------------------------------------
	gin.SetMode(gin.TestMode)
	s.agent = newMockAgentClient()
	logger := zap.NewNop()
	tracer := noop.NewTracerProvider().Tracer("integration-test")

	repo := containerrepo.NewContainerRepository(s.db)
	selector := &hostSelectorAdapter{}
	svc := containersvc.NewContainerService(repo, s.agent, selector, s.rdb, logger, tracer)
	handler := containerhandler.NewContainerHandler(svc, s.rdb, logger)

	// JWT service (in-memory RSA keys)
	jwtSvc, err := newJWTTestService(s.rdb)
	require.NoError(t, err)

	userRepo := &inMemoryUserRepo{}
	adminUser := userRepo.seed("admin@dcms.test", "Admin1234!", "admin")
	viewerUser := userRepo.seed("viewer@dcms.test", "Viewer1234!", "viewer")

	authHdlr := authhandler.NewAuthHandler(userRepo, jwtSvc, logger)

	// Issue tokens for pre-seeded users
	s.adminToken = s.issueToken(jwtSvc, adminUser)
	s.viewerToken = s.issueToken(jwtSvc, viewerUser)
	s.defaultNsID = uuid.New().String()

	// Build the Gin router
	s.router = gin.New()
	s.router.Use(gin.Recovery())

	// Auth middleware using test public key
	authMw := sharedmw.Authenticate(sharedmw.JWTConfig{PublicKey: &jwtSvc.privateKey.PublicKey})

	// Public auth routes
	public := s.router.Group("/v1")
	authHdlr.RegisterRoutes(public, public.Group("", authMw))

	// Protected container routes (admin only for mutating ops)
	protected := s.router.Group("/v1/containers", authMw)
	handler.RegisterRoutes(protected)

	// Protected container routes enforcing viewer RBAC
	adminOnly := s.router.Group("/v1/admin/containers", authMw,
		sharedmw.RequireRole("admin", "operator"),
	)
	handler.RegisterRoutes(adminOnly)

	s.httpServer = httptest.NewServer(s.router)
}

// TearDownSuite stops all containers and closes connections.
func (s *ContainerLifecycleSuite) TearDownSuite() {
	ctx := context.Background()
	if s.httpServer != nil {
		s.httpServer.Close()
	}
	if s.rawDB != nil {
		_ = s.rawDB.Close()
	}
	if s.rdb != nil {
		_ = s.rdb.Close()
	}
	if s.pgContainer != nil {
		_ = s.pgContainer.Terminate(ctx)
	}
	if s.redisContainer != nil {
		_ = s.redisContainer.Terminate(ctx)
	}
}

// SetupTest clears the containers table before each individual test so tests
// are fully independent.
func (s *ContainerLifecycleSuite) SetupTest() {
	s.db.Exec("DELETE FROM containers")
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (s *ContainerLifecycleSuite) runMigrations() {
	ddl := `
	CREATE TABLE IF NOT EXISTS containers (
		id             UUID PRIMARY KEY,
		docker_id      VARCHAR(64)  NOT NULL,
		name           VARCHAR(255) NOT NULL,
		image          TEXT         NOT NULL,
		status         VARCHAR(32)  NOT NULL DEFAULT 'created',
		namespace_id   UUID         NOT NULL,
		host_id        VARCHAR(255) NOT NULL DEFAULT '',
		labels         JSONB,
		restart_policy VARCHAR(64)  DEFAULT '',
		cpu_quota      FLOAT        DEFAULT 0,
		memory_mb      BIGINT       DEFAULT 0,
		created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
		updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
		deleted_at     TIMESTAMPTZ
	);
	CREATE INDEX IF NOT EXISTS idx_containers_name        ON containers(name);
	CREATE INDEX IF NOT EXISTS idx_containers_status      ON containers(status);
	CREATE INDEX IF NOT EXISTS idx_containers_namespace   ON containers(namespace_id);
	CREATE INDEX IF NOT EXISTS idx_containers_deleted_at  ON containers(deleted_at);
	`
	require.NoError(s.T(), s.db.Exec(ddl).Error, "run DDL migrations")
}

func (s *ContainerLifecycleSuite) issueToken(jwtSvc *jwtTestService, user *authmodel.User) string {
	tok, _, err := jwtSvc.IssueAccessToken(user)
	require.NoError(s.T(), err)
	return tok
}

func (s *ContainerLifecycleSuite) baseURL() string {
	return s.httpServer.URL
}

func (s *ContainerLifecycleSuite) adminHeader() http.Header {
	h := http.Header{}
	h.Set("Authorization", "Bearer "+s.adminToken)
	h.Set("Content-Type", "application/json")
	return h
}

func (s *ContainerLifecycleSuite) viewerHeader() http.Header {
	h := http.Header{}
	h.Set("Authorization", "Bearer "+s.viewerToken)
	h.Set("Content-Type", "application/json")
	return h
}

// doRequest is a helper that builds and executes an HTTP request against the
// test server and returns the response. Callers own closing the body.
func (s *ContainerLifecycleSuite) doRequest(method, path string, body interface{}, headers http.Header) *http.Response {
	s.T().Helper()
	var bodyReader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(s.T(), err)
		bodyReader = bytes.NewReader(b)
	} else {
		bodyReader = bytes.NewReader(nil)
	}

	req, err := http.NewRequest(method, s.baseURL()+path, bodyReader)
	require.NoError(s.T(), err)
	for k, vv := range headers {
		for _, v := range vv {
			req.Header.Add(k, v)
		}
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(s.T(), err)
	return resp
}

// decodeJSON decodes a JSON response body into v.
func (s *ContainerLifecycleSuite) decodeJSON(resp *http.Response, v interface{}) {
	s.T().Helper()
	defer resp.Body.Close()
	require.NoError(s.T(), json.NewDecoder(resp.Body).Decode(v))
}

// containerCreateBody returns a minimal valid create request payload.
func (s *ContainerLifecycleSuite) containerCreateBody(name string) map[string]interface{} {
	return map[string]interface{}{
		"name":         name,
		"image":        "nginx:1.25-alpine",
		"namespace_id": s.defaultNsID,
		"restart_policy": "unless-stopped",
		"cpu_quota":    0.5,
		"memory_mb":    128,
	}
}

// ---------------------------------------------------------------------------
// Container lifecycle tests
// ---------------------------------------------------------------------------

// TestCreateContainer_HappyPath verifies that a POST /v1/containers with a
// valid payload returns HTTP 201 and creates a row in the database.
func (s *ContainerLifecycleSuite) TestCreateContainer_HappyPath() {
	t := s.T()
	payload := s.containerCreateBody("happy-path-ctr")

	resp := s.doRequest(http.MethodPost, "/v1/containers", payload, s.adminHeader())
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var body struct {
		Data struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"data"`
	}
	s.decodeJSON(resp, &body)

	assert.Equal(t, "happy-path-ctr", body.Data.Name)
	assert.NotEmpty(t, body.Data.ID, "container ID must be set")

	// Verify DB row
	var count int64
	s.db.Model(&containermodel.Container{}).
		Where("name = ? AND deleted_at IS NULL", "happy-path-ctr").
		Count(&count)
	assert.Equal(t, int64(1), count, "exactly one DB row must exist")
}

// TestCreateContainer_DuplicateName verifies that attempting to create a second
// container with the same name within the same namespace returns HTTP 409.
func (s *ContainerLifecycleSuite) TestCreateContainer_DuplicateName() {
	t := s.T()
	payload := s.containerCreateBody("dup-name-ctr")

	// First request must succeed.
	resp1 := s.doRequest(http.MethodPost, "/v1/containers", payload, s.adminHeader())
	resp1.Body.Close()
	require.Equal(t, http.StatusCreated, resp1.StatusCode)

	// Second request with identical name must fail.
	resp2 := s.doRequest(http.MethodPost, "/v1/containers", payload, s.adminHeader())
	defer resp2.Body.Close()
	assert.Equal(t, http.StatusConflict, resp2.StatusCode)
}

// TestStartContainer_TransitionToRunning verifies the state machine transition
// from created → running when POST /containers/:id/start is called.
func (s *ContainerLifecycleSuite) TestStartContainer_TransitionToRunning() {
	t := s.T()

	// Create container (starts in "running" per service impl; force to stopped first)
	createResp := s.doRequest(http.MethodPost, "/v1/containers",
		s.containerCreateBody("start-transition-ctr"), s.adminHeader())
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created struct {
		Data struct{ ID string `json:"id"` } `json:"data"`
	}
	s.decodeJSON(createResp, &created)
	ctrID := created.Data.ID
	require.NotEmpty(t, ctrID)

	// Force status to stopped in DB to simulate a pre-stopped container.
	s.db.Model(&containermodel.Container{}).Where("id = ?", ctrID).
		Update("status", containermodel.StatusStopped)

	// Start it.
	startResp := s.doRequest(http.MethodPost, "/v1/containers/"+ctrID+"/start", nil, s.adminHeader())
	defer startResp.Body.Close()
	assert.Equal(t, http.StatusOK, startResp.StatusCode)

	// GET should reflect running status.
	getResp := s.doRequest(http.MethodGet, "/v1/containers/"+ctrID, nil, s.adminHeader())
	var got struct {
		Data struct{ Status string `json:"status"` } `json:"data"`
	}
	s.decodeJSON(getResp, &got)
	assert.Equal(t, containermodel.StatusRunning, got.Data.Status)
}

// TestStopContainer_TransitionToStopped verifies running → stopped transition.
func (s *ContainerLifecycleSuite) TestStopContainer_TransitionToStopped() {
	t := s.T()

	createResp := s.doRequest(http.MethodPost, "/v1/containers",
		s.containerCreateBody("stop-transition-ctr"), s.adminHeader())
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created struct {
		Data struct{ ID string `json:"id"` } `json:"data"`
	}
	s.decodeJSON(createResp, &created)
	ctrID := created.Data.ID

	// Ensure container is running.
	s.db.Model(&containermodel.Container{}).Where("id = ?", ctrID).
		Update("status", containermodel.StatusRunning)

	// Stop it.
	stopResp := s.doRequest(http.MethodPost, "/v1/containers/"+ctrID+"/stop", nil, s.adminHeader())
	defer stopResp.Body.Close()
	assert.Equal(t, http.StatusOK, stopResp.StatusCode)

	// Verify stopped status via GET.
	getResp := s.doRequest(http.MethodGet, "/v1/containers/"+ctrID, nil, s.adminHeader())
	var got struct {
		Data struct{ Status string `json:"status"` } `json:"data"`
	}
	s.decodeJSON(getResp, &got)
	assert.Equal(t, containermodel.StatusStopped, got.Data.Status)
}

// TestDeleteContainer_SoftDelete verifies that DELETE returns 204, subsequent
// GET returns 404, and the DB row has deleted_at set.
func (s *ContainerLifecycleSuite) TestDeleteContainer_SoftDelete() {
	t := s.T()

	createResp := s.doRequest(http.MethodPost, "/v1/containers",
		s.containerCreateBody("soft-delete-ctr"), s.adminHeader())
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created struct {
		Data struct{ ID string `json:"id"` } `json:"data"`
	}
	s.decodeJSON(createResp, &created)
	ctrID := created.Data.ID

	// Delete
	delResp := s.doRequest(http.MethodDelete, "/v1/containers/"+ctrID, nil, s.adminHeader())
	defer delResp.Body.Close()
	assert.Equal(t, http.StatusNoContent, delResp.StatusCode)

	// GET must now return 404
	getResp := s.doRequest(http.MethodGet, "/v1/containers/"+ctrID, nil, s.adminHeader())
	defer getResp.Body.Close()
	assert.Equal(t, http.StatusNotFound, getResp.StatusCode)

	// DB row must have deleted_at set (Unscoped to bypass GORM soft-delete filter)
	var ctr containermodel.Container
	err := s.db.Unscoped().Where("id = ?", ctrID).First(&ctr).Error
	require.NoError(t, err)
	assert.NotNil(t, ctr.DeletedAt, "deleted_at must be set after soft delete")
}

// TestListContainers_Pagination creates 25 containers and verifies that a
// page=1&limit=10 request returns exactly 10 items with totalCount=25.
func (s *ContainerLifecycleSuite) TestListContainers_Pagination() {
	t := s.T()

	// Seed 25 containers directly in DB for speed.
	for i := 0; i < 25; i++ {
		ctr := &containermodel.Container{
			ID:          uuid.New().String(),
			DockerID:    "sha256:page" + fmt.Sprintf("%02d", i),
			Name:        fmt.Sprintf("page-ctr-%02d", i),
			Image:       "nginx:1.25-alpine",
			Status:      containermodel.StatusStopped,
			NamespaceID: s.defaultNsID,
			HostID:      "host-01",
		}
		require.NoError(t, s.db.Create(ctr).Error)
	}

	resp := s.doRequest(http.MethodGet, "/v1/containers?page=1&page_size=10", nil, s.adminHeader())
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Data []interface{} `json:"data"`
		Meta struct {
			Total    int64 `json:"total"`
			Page     int   `json:"page"`
			PageSize int   `json:"page_size"`
		} `json:"meta"`
	}
	s.decodeJSON(resp, &body)

	assert.Len(t, body.Data, 10, "page 1 must have 10 items")
	assert.Equal(t, int64(25), body.Meta.Total, "total must equal 25")
	assert.Equal(t, 1, body.Meta.Page)
	assert.Equal(t, 10, body.Meta.PageSize)
}

// TestListContainers_FilterByStatus seeds a mix of running/stopped containers
// and verifies that the status filter returns only matching records.
func (s *ContainerLifecycleSuite) TestListContainers_FilterByStatus() {
	t := s.T()

	for i, status := range []string{
		containermodel.StatusRunning,
		containermodel.StatusRunning,
		containermodel.StatusStopped,
		containermodel.StatusStopped,
		containermodel.StatusStopped,
	} {
		ctr := &containermodel.Container{
			ID:          uuid.New().String(),
			DockerID:    "sha256:flt" + fmt.Sprintf("%d", i),
			Name:        fmt.Sprintf("filter-ctr-%d", i),
			Image:       "alpine:3.19",
			Status:      status,
			NamespaceID: s.defaultNsID,
			HostID:      "host-01",
		}
		require.NoError(t, s.db.Create(ctr).Error)
	}

	resp := s.doRequest(http.MethodGet, "/v1/containers?status=running", nil, s.adminHeader())
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Data []struct{ Status string `json:"status"` } `json:"data"`
		Meta struct{ Total int64 `json:"total"` }      `json:"meta"`
	}
	s.decodeJSON(resp, &body)

	assert.Equal(t, int64(2), body.Meta.Total, "only 2 running containers expected")
	for _, item := range body.Data {
		assert.Equal(t, containermodel.StatusRunning, item.Status,
			"all returned items must have status=running")
	}
}

// TestContainerSSE_EventStream creates and starts a container, subscribes to the
// SSE event stream, and asserts that a status event is received within 2 seconds.
func (s *ContainerLifecycleSuite) TestContainerSSE_EventStream() {
	t := s.T()

	// Create a container.
	createResp := s.doRequest(http.MethodPost, "/v1/containers",
		s.containerCreateBody("sse-ctr"), s.adminHeader())
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created struct {
		Data struct{ ID string `json:"id"` } `json:"data"`
	}
	s.decodeJSON(createResp, &created)
	ctrID := created.Data.ID
	require.NotEmpty(t, ctrID)

	// Subscribe to SSE event stream on a background goroutine.
	eventReceived := make(chan string, 1)
	streamCtx, streamCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer streamCancel()

	go func() {
		req, err := http.NewRequestWithContext(streamCtx,
			http.MethodGet, s.baseURL()+"/v1/containers/"+ctrID+"/logs", nil)
		if err != nil {
			return
		}
		req.Header.Set("Authorization", "Bearer "+s.adminToken)
		req.Header.Set("Accept", "text/event-stream")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data:") {
				select {
				case eventReceived <- strings.TrimPrefix(line, "data: "):
				default:
				}
				return
			}
		}
	}()

	// Publish a synthetic event to the Redis channel the SSE handler subscribes to.
	time.Sleep(200 * time.Millisecond) // give SSE subscription time to establish
	logChannel := fmt.Sprintf("dcms.logs.%s", ctrID)
	payload := fmt.Sprintf(`{"container_id":%q,"status":"running","ts":%q}`,
		ctrID, time.Now().UTC().Format(time.RFC3339))
	require.NoError(t,
		s.rdb.Publish(context.Background(), logChannel, payload).Err(),
	)

	select {
	case event := <-eventReceived:
		assert.Contains(t, event, ctrID, "event must reference the container ID")
	case <-time.After(2 * time.Second):
		t.Fatal("SSE event not received within 2 seconds")
	}
}

// ---------------------------------------------------------------------------
// AuthIntegrationSuite
// ---------------------------------------------------------------------------

// AuthIntegrationSuite exercises the authentication API (login, refresh,
// middleware enforcement, and RBAC) against an in-process HTTP server.
type AuthIntegrationSuite struct {
	suite.Suite

	redisContainer testcontainers.Container
	rdb            *redis.Client

	jwtSvc   *jwtTestService
	userRepo *inMemoryUserRepo

	adminUser  *authmodel.User
	viewerUser *authmodel.User

	router     *gin.Engine
	httpServer *httptest.Server
}

func TestAuthIntegrationSuite(t *testing.T) {
	suite.Run(t, new(AuthIntegrationSuite))
}

func (s *AuthIntegrationSuite) SetupSuite() {
	ctx := context.Background()
	t := s.T()

	// Start Redis (needed for refresh token storage).
	redisCtr, err := tcredis.RunContainer(ctx,
		testcontainers.WithImage("redis:7-alpine"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("Ready to accept connections").WithStartupTimeout(30*time.Second),
		),
	)
	require.NoError(t, err)
	s.redisContainer = redisCtr

	redisAddr, err := redisCtr.Endpoint(ctx, "")
	require.NoError(t, err)

	s.rdb = redis.NewClient(&redis.Options{Addr: redisAddr})
	require.NoError(t, s.rdb.Ping(ctx).Err())

	s.jwtSvc, err = newJWTTestService(s.rdb)
	require.NoError(t, err)

	s.userRepo = &inMemoryUserRepo{}
	s.adminUser = s.userRepo.seed("admin@auth.test", "AdminPass1!", "admin")
	s.viewerUser = s.userRepo.seed("viewer@auth.test", "ViewerPass1!", "viewer")

	logger := zap.NewNop()
	authHdlr := authhandler.NewAuthHandler(s.userRepo, s.jwtSvc, logger)
	authMw := sharedmw.Authenticate(sharedmw.JWTConfig{PublicKey: &s.jwtSvc.privateKey.PublicKey})

	gin.SetMode(gin.TestMode)
	s.router = gin.New()
	s.router.Use(gin.Recovery())

	public := s.router.Group("/v1")
	protected := s.router.Group("/v1", authMw)
	authHdlr.RegisterRoutes(public, protected)

	// Stub protected containers endpoint to test RBAC.
	s.router.POST("/v1/containers",
		authMw,
		sharedmw.RequireRole("admin", "operator"),
		func(c *gin.Context) { c.JSON(http.StatusCreated, gin.H{"data": gin.H{"id": "stub"}}) },
	)

	s.httpServer = httptest.NewServer(s.router)
}

func (s *AuthIntegrationSuite) TearDownSuite() {
	ctx := context.Background()
	if s.httpServer != nil {
		s.httpServer.Close()
	}
	if s.rdb != nil {
		_ = s.rdb.Close()
	}
	if s.redisContainer != nil {
		_ = s.redisContainer.Terminate(ctx)
	}
}

// ---------------------------------------------------------------------------
// Auth test cases
// ---------------------------------------------------------------------------

// TestLogin_ValidCredentials verifies that a correct email+password combination
// returns HTTP 200 and a non-empty access_token.
func (s *AuthIntegrationSuite) TestLogin_ValidCredentials() {
	t := s.T()
	payload := map[string]string{"email": "admin@auth.test", "password": "AdminPass1!"}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(s.httpServer.URL+"/v1/login",
		"application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.NotEmpty(t, result["access_token"], "access_token must be present")
	assert.NotEmpty(t, result["refresh_token"], "refresh_token must be present")
	assert.Equal(t, "Bearer", result["token_type"])
}

// TestLogin_InvalidCredentials verifies that a wrong password returns HTTP 401.
func (s *AuthIntegrationSuite) TestLogin_InvalidCredentials() {
	t := s.T()
	payload := map[string]string{"email": "admin@auth.test", "password": "WrongPassword9!"}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(s.httpServer.URL+"/v1/login",
		"application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	var result map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "invalid credentials", result["error"])
}

// TestRefreshToken_Valid logs in, extracts the refresh token, calls
// POST /v1/refresh, and asserts a new access_token is returned.
func (s *AuthIntegrationSuite) TestRefreshToken_Valid() {
	t := s.T()

	// Log in to obtain initial tokens.
	loginPayload := map[string]string{"email": "admin@auth.test", "password": "AdminPass1!"}
	b, _ := json.Marshal(loginPayload)
	loginResp, err := http.Post(s.httpServer.URL+"/v1/login",
		"application/json", bytes.NewReader(b))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, loginResp.StatusCode)

	var loginBody map[string]interface{}
	require.NoError(t, json.NewDecoder(loginResp.Body).Decode(&loginBody))
	loginResp.Body.Close()

	refreshToken, ok := loginBody["refresh_token"].(string)
	require.True(t, ok, "refresh_token must be a string")
	require.NotEmpty(t, refreshToken)

	// Use the refresh token to obtain a new access token.
	refreshPayload := map[string]string{"refresh_token": refreshToken}
	rb, _ := json.Marshal(refreshPayload)
	refreshResp, err := http.Post(s.httpServer.URL+"/v1/refresh",
		"application/json", bytes.NewReader(rb))
	require.NoError(t, err)
	defer refreshResp.Body.Close()

	assert.Equal(t, http.StatusOK, refreshResp.StatusCode)

	var refreshBody map[string]interface{}
	require.NoError(t, json.NewDecoder(refreshResp.Body).Decode(&refreshBody))
	newToken, ok := refreshBody["access_token"].(string)
	assert.True(t, ok, "access_token must be present after refresh")
	assert.NotEmpty(t, newToken)
}

// TestAuthMiddleware_MissingToken verifies that a protected route returns HTTP
// 401 when no Authorization header is present.
func (s *AuthIntegrationSuite) TestAuthMiddleware_MissingToken() {
	t := s.T()

	req, err := http.NewRequest(http.MethodPost, s.httpServer.URL+"/v1/containers",
		bytes.NewReader([]byte(`{"name":"x","image":"y","namespace_id":"00000000-0000-0000-0000-000000000001"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	// Deliberately omit Authorization header.

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// TestRBAC_ViewerCannotCreateContainer verifies that a user with the "viewer"
// role receives HTTP 403 when attempting to create a container.
func (s *AuthIntegrationSuite) TestRBAC_ViewerCannotCreateContainer() {
	t := s.T()

	viewerToken, _, err := s.jwtSvc.IssueAccessToken(s.viewerUser)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, s.httpServer.URL+"/v1/containers",
		bytes.NewReader([]byte(`{"name":"viewer-ctr","image":"nginx","namespace_id":"00000000-0000-0000-0000-000000000001"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+viewerToken)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	var result map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "insufficient permissions", result["error"])
}
