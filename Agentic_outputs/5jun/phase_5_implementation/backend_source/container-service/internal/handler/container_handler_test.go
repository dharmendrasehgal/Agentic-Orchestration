// Package handler_test contains unit tests for the container HTTP handlers.
// Tests use httptest.NewRecorder and inject mock service implementations to
// exercise handler logic in isolation from the database and Docker daemon.
package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"dcms/container-service/internal/handler"
	"dcms/container-service/internal/model"
	"dcms/container-service/internal/service"
	agentv1 "dcms/container-service/gen/proto/agent/v1"
)

// --------------------------------------------------------------------------
// Mock service
// --------------------------------------------------------------------------

// mockContainerService satisfies the handler's service dependency.
type mockContainerService struct {
	mock.Mock
}

func (m *mockContainerService) ListContainers(ctx context.Context, filter service.ContainerFilter) ([]*model.Container, int64, error) {
	args := m.Called(ctx, filter)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]*model.Container), int64(args.Int(1)), args.Error(2)
}

func (m *mockContainerService) GetContainer(ctx context.Context, id string) (*model.Container, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Container), args.Error(1)
}

func (m *mockContainerService) CreateContainer(ctx context.Context, req service.CreateContainerRequest) (*model.Container, error) {
	args := m.Called(ctx, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Container), args.Error(1)
}

func (m *mockContainerService) StartContainer(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockContainerService) StopContainer(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockContainerService) RestartContainer(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockContainerService) DeleteContainer(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockContainerService) StreamContainerStats(ctx context.Context, hostID, containerID string) (<-chan *agentv1.ContainerStats, <-chan error) {
	args := m.Called(ctx, hostID, containerID)
	return args.Get(0).(<-chan *agentv1.ContainerStats), args.Get(1).(<-chan error)
}

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

func init() {
	gin.SetMode(gin.TestMode)
}

// newTestHandler wires a ContainerHandler with the mock service and a no-op Redis client stub.
func newTestHandler(svc *mockContainerService) (*handler.ContainerHandler, *gin.Engine) {
	logger := zap.NewNop()

	// Use a minimal Redis client stub (not connected); tests that exercise
	// publish paths use the mock service to avoid actual Redis connections.
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})

	h := handler.NewContainerHandler(svc, rdb, logger)

	r := gin.New()
	group := r.Group("/containers")
	h.RegisterRoutes(group)

	return h, r
}

// sampleContainer returns a populated *model.Container for use in test assertions.
func sampleContainer(id string) *model.Container {
	return &model.Container{
		ID:          id,
		DockerID:    "abc" + id,
		Name:        "test-container-" + id,
		Image:       "nginx:latest",
		Status:      model.StatusRunning,
		NamespaceID: "ns-001",
		HostID:      "host-001",
		CPUQuota:    0.5,
		MemoryMB:    512,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
}

// --------------------------------------------------------------------------
// TestListContainers_Success
// --------------------------------------------------------------------------

func TestListContainers_Success(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	containers := []*model.Container{
		sampleContainer("id-1"),
		sampleContainer("id-2"),
		sampleContainer("id-3"),
	}

	svc.On("ListContainers", mock.Anything, mock.MatchedBy(func(f service.ContainerFilter) bool {
		return f.Page == 1 && f.PageSize == 20
	})).Return(containers, 3, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/containers", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp["data"].([]interface{})
	require.True(t, ok, "data field should be an array")
	assert.Len(t, data, 3)

	meta := resp["meta"].(map[string]interface{})
	assert.Equal(t, float64(3), meta["total"])
	assert.Equal(t, float64(1), meta["page"])

	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestListContainers_StatusFilter
// --------------------------------------------------------------------------

func TestListContainers_StatusFilter(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	running := []*model.Container{sampleContainer("id-r1")}

	svc.On("ListContainers", mock.Anything, mock.MatchedBy(func(f service.ContainerFilter) bool {
		return f.Status == "running"
	})).Return(running, 1, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/containers?status=running", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestListContainers_Unauthorized — missing token → handler still reaches
// list (auth is applied at the router level, not inside the handler).
// This test verifies the handler returns 500 when the service errors.
// --------------------------------------------------------------------------

func TestListContainers_ServiceError(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	svc.On("ListContainers", mock.Anything, mock.Anything).
		Return(nil, 0, errors.New("database unavailable"))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/containers", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestGetContainer_Success
// --------------------------------------------------------------------------

func TestGetContainer_Success(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	c := sampleContainer("abc-123")
	svc.On("GetContainer", mock.Anything, "abc-123").Return(c, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/containers/abc-123", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "abc-123", data["id"])

	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestCreateContainer_Success
// --------------------------------------------------------------------------

func TestCreateContainer_Success(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	created := sampleContainer("new-001")
	svc.On("CreateContainer", mock.Anything, mock.MatchedBy(func(req service.CreateContainerRequest) bool {
		return req.Name == "my-nginx" && req.Image == "nginx:latest"
	})).Return(created, nil)

	body := map[string]interface{}{
		"name":         "my-nginx",
		"image":        "nginx:latest",
		"namespace_id": "550e8400-e29b-41d4-a716-446655440000",
	}
	bodyBytes, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/containers", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotNil(t, resp["data"])

	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestCreateContainer_InvalidBody
// --------------------------------------------------------------------------

func TestCreateContainer_InvalidBody(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	// Missing required "name" and "image" fields.
	body := `{"namespace_id":"550e8400-e29b-41d4-a716-446655440000"}`

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/containers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp, "error")

	svc.AssertNotCalled(t, "CreateContainer")
}

// --------------------------------------------------------------------------
// TestStartContainer_NotFound
// --------------------------------------------------------------------------

func TestStartContainer_NotFound(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	svc.On("StartContainer", mock.Anything, "ghost-id").Return(service.ErrContainerNotFound)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/containers/ghost-id/start", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestStopContainer_Success
// --------------------------------------------------------------------------

func TestStopContainer_Success(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	svc.On("StopContainer", mock.Anything, "cid-stop").Return(nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/containers/cid-stop/stop", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Assert service was called with the correct container ID.
	svc.AssertCalled(t, "StopContainer", mock.Anything, "cid-stop")
}

// --------------------------------------------------------------------------
// TestDeleteContainer_Success
// --------------------------------------------------------------------------

func TestDeleteContainer_Success(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	svc.On("DeleteContainer", mock.Anything, "del-001").Return(nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/containers/del-001", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)
	svc.AssertExpectations(t)
}

// --------------------------------------------------------------------------
// TestStreamContainerLogs_SSE
// --------------------------------------------------------------------------

func TestStreamContainerLogs_SSE(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	// GetContainer is called first to validate the container exists.
	existing := sampleContainer("stream-id")
	svc.On("GetContainer", mock.Anything, "stream-id").Return(existing, nil)

	// Use a request with a cancelled context so the SSE handler exits quickly.
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/containers/stream-id/logs", nil)

	// Cancel the context immediately so the SSE loop exits.
	ctx, cancel := context.WithTimeout(req.Context(), 50*time.Millisecond)
	defer cancel()
	req = req.WithContext(ctx)

	// Run in a goroutine because SSE blocks until the context is done.
	done := make(chan struct{})
	go func() {
		defer close(done)
		r.ServeHTTP(w, req)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("SSE handler did not exit within 2 seconds")
	}

	// The critical assertion: Content-Type must be text/event-stream.
	assert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))
	assert.Equal(t, "no-cache", w.Header().Get("Cache-Control"))
}

// --------------------------------------------------------------------------
// TestRestartContainer_NotFound
// --------------------------------------------------------------------------

func TestRestartContainer_NotFound(t *testing.T) {
	svc := &mockContainerService{}
	_, r := newTestHandler(svc)

	svc.On("RestartContainer", mock.Anything, "no-such-id").Return(service.ErrContainerNotFound)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/containers/%s/restart", "no-such-id"), nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	svc.AssertExpectations(t)
}
