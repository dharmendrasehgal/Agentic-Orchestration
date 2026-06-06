// Package handler implements HTTP handlers for the container-service.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"dcms/container-service/internal/model"
	"dcms/container-service/internal/service"
)

// ContainerHandler holds the dependencies required by container HTTP handlers.
type ContainerHandler struct {
	svc    service.ContainerService
	rdb    *redis.Client
	logger *zap.Logger
}

// NewContainerHandler constructs a ContainerHandler with the supplied dependencies.
func NewContainerHandler(svc service.ContainerService, rdb *redis.Client, logger *zap.Logger) *ContainerHandler {
	return &ContainerHandler{
		svc:    svc,
		rdb:    rdb,
		logger: logger,
	}
}

// RegisterRoutes attaches all container routes to the provided router group.
// The group is expected to already have authentication middleware applied.
func (h *ContainerHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("", h.ListContainers)
	rg.POST("", h.CreateContainer)
	rg.GET("/:id", h.GetContainer)
	rg.DELETE("/:id", h.DeleteContainer)
	rg.POST("/:id/start", h.StartContainer)
	rg.POST("/:id/stop", h.StopContainer)
	rg.POST("/:id/restart", h.RestartContainer)
	rg.GET("/:id/logs", h.StreamContainerLogs)
	rg.GET("/:id/stats", h.StreamContainerStats)
}

// --------------------------------------------------------------------------
// List
// --------------------------------------------------------------------------

// ListContainers godoc
// GET /namespaces/:namespace/containers
// Query params: status (string), page (int, default 1), page_size (int, default 20)
func (h *ContainerHandler) ListContainers(c *gin.Context) {
	namespace := c.Param("namespace")
	if namespace == "" {
		namespace = c.Query("namespace")
	}

	statusFilter := c.Query("status")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}

	filter := service.ContainerFilter{
		Namespace: namespace,
		Status:    statusFilter,
		Page:      page,
		PageSize:  pageSize,
	}

	containers, total, err := h.svc.ListContainers(c.Request.Context(), filter)
	if err != nil {
		h.logger.Error("ListContainers failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list containers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": containers,
		"meta": gin.H{
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// --------------------------------------------------------------------------
// Get
// --------------------------------------------------------------------------

// GetContainer godoc
// GET /containers/:id
func (h *ContainerHandler) GetContainer(c *gin.Context) {
	id := c.Param("id")

	container, err := h.svc.GetContainer(c.Request.Context(), id)
	if err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		h.logger.Error("GetContainer failed", zap.String("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get container"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": container})
}

// --------------------------------------------------------------------------
// Create
// --------------------------------------------------------------------------

// ContainerCreateRequest is the JSON body expected by CreateContainer.
type ContainerCreateRequest struct {
	Name        string            `json:"name"         binding:"required,max=255"`
	Image       string            `json:"image"        binding:"required"`
	NamespaceID string            `json:"namespace_id" binding:"required,uuid"`
	Env         map[string]string `json:"env"`
	Ports       []model.PortSpec  `json:"ports"`
	Volumes     []model.VolumeMount `json:"volumes"`
	Labels      map[string]string `json:"labels"`
	RestartPolicy string          `json:"restart_policy"` // no, always, on-failure, unless-stopped
	CPUQuota    float64           `json:"cpu_quota"`      // fractional vCPUs
	MemoryMB    int64             `json:"memory_mb"`
	Command     []string          `json:"command"`
}

// CreateContainer godoc
// POST /containers
func (h *ContainerHandler) CreateContainer(c *gin.Context) {
	var req ContainerCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	createReq := service.CreateContainerRequest{
		Name:          req.Name,
		Image:         req.Image,
		NamespaceID:   req.NamespaceID,
		Env:           req.Env,
		Ports:         req.Ports,
		Volumes:       req.Volumes,
		Labels:        req.Labels,
		RestartPolicy: req.RestartPolicy,
		CPUQuota:      req.CPUQuota,
		MemoryMB:      req.MemoryMB,
		Command:       req.Command,
	}

	container, err := h.svc.CreateContainer(c.Request.Context(), createReq)
	if err != nil {
		h.logger.Error("CreateContainer failed", zap.String("image", req.Image), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create container"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": container})
}

// --------------------------------------------------------------------------
// Start / Stop / Restart
// --------------------------------------------------------------------------

// StartContainer godoc
// POST /containers/:id/start
func (h *ContainerHandler) StartContainer(c *gin.Context) {
	id := c.Param("id")

	if err := h.svc.StartContainer(c.Request.Context(), id); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		h.logger.Error("StartContainer failed", zap.String("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start container"})
		return
	}

	// Publish SSE lifecycle event to Redis so interested subscribers are notified.
	h.publishLifecycleEvent(c.Request.Context(), "container.started", id)

	c.JSON(http.StatusOK, gin.H{"message": "container started"})
}

// StopContainer godoc
// POST /containers/:id/stop
func (h *ContainerHandler) StopContainer(c *gin.Context) {
	id := c.Param("id")

	if err := h.svc.StopContainer(c.Request.Context(), id); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		h.logger.Error("StopContainer failed", zap.String("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to stop container"})
		return
	}

	h.publishLifecycleEvent(c.Request.Context(), "container.stopped", id)

	c.JSON(http.StatusOK, gin.H{"message": "container stopped"})
}

// RestartContainer godoc
// POST /containers/:id/restart
func (h *ContainerHandler) RestartContainer(c *gin.Context) {
	id := c.Param("id")

	if err := h.svc.RestartContainer(c.Request.Context(), id); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		h.logger.Error("RestartContainer failed", zap.String("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to restart container"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "container restarted"})
}

// --------------------------------------------------------------------------
// Delete
// --------------------------------------------------------------------------

// DeleteContainer godoc
// DELETE /containers/:id
// Performs a soft delete; returns 204 No Content on success.
func (h *ContainerHandler) DeleteContainer(c *gin.Context) {
	id := c.Param("id")

	if err := h.svc.DeleteContainer(c.Request.Context(), id); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		h.logger.Error("DeleteContainer failed", zap.String("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete container"})
		return
	}

	c.Status(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// SSE: Logs
// --------------------------------------------------------------------------

// StreamContainerLogs godoc
// GET /containers/:id/logs
// Server-Sent Events stream of log lines from the log-service Redis channel.
// Sends a heartbeat comment every 30 s to keep the connection alive.
func (h *ContainerHandler) StreamContainerLogs(c *gin.Context) {
	id := c.Param("id")

	// Verify the container exists before opening the stream.
	if _, err := h.svc.GetContainer(c.Request.Context(), id); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate container"})
		return
	}

	// Set SSE response headers.
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // Disable Nginx buffering.

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	channel := fmt.Sprintf("dcms.logs.%s", id)
	pubsub := h.rdb.Subscribe(c.Request.Context(), channel)
	defer pubsub.Close()

	msgCh := pubsub.Channel()
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	ctx := c.Request.Context()

	for {
		select {
		case <-ctx.Done():
			return

		case msg, ok := <-msgCh:
			if !ok {
				return
			}
			fmt.Fprintf(c.Writer, "data: %s\n\n", msg.Payload)
			flusher.Flush()

		case <-heartbeat.C:
			// SSE comment line keeps the connection alive.
			fmt.Fprintf(c.Writer, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

// --------------------------------------------------------------------------
// SSE: Stats
// --------------------------------------------------------------------------

// statsPayload is the JSON structure sent over the stats SSE stream.
type statsPayload struct {
	ContainerID string  `json:"container_id"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemUsageMB  float64 `json:"mem_usage_mb"`
	MemLimitMB  float64 `json:"mem_limit_mb"`
	NetRxBytes  uint64  `json:"net_rx_bytes"`
	NetTxBytes  uint64  `json:"net_tx_bytes"`
	BlockRead   uint64  `json:"block_read_bytes"`
	BlockWrite  uint64  `json:"block_write_bytes"`
	Timestamp   string  `json:"timestamp"`
}

// StreamContainerStats godoc
// GET /containers/:id/stats
// Server-Sent Events stream of live resource usage statistics sourced from
// the per-host agent gRPC stream.
func (h *ContainerHandler) StreamContainerStats(c *gin.Context) {
	id := c.Param("id")

	container, err := h.svc.GetContainer(c.Request.Context(), id)
	if err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate container"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	statsCh, errCh := h.svc.StreamContainerStats(c.Request.Context(), container.HostID, id)
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	ctx := c.Request.Context()

	for {
		select {
		case <-ctx.Done():
			return

		case err, ok := <-errCh:
			if !ok {
				return
			}
			h.logger.Warn("stats stream error", zap.String("container_id", id), zap.Error(err))
			fmt.Fprintf(c.Writer, "event: error\ndata: {\"error\":%q}\n\n", err.Error())
			flusher.Flush()
			return

		case stat, ok := <-statsCh:
			if !ok {
				return
			}
			payload, err := json.Marshal(stat)
			if err != nil {
				continue
			}
			fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
			flusher.Flush()

		case <-heartbeat.C:
			fmt.Fprintf(c.Writer, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// publishLifecycleEvent publishes a minimal lifecycle event to the Redis
// pub/sub channel used by the SSE event bus. Errors are logged but not
// propagated to the caller because the primary operation has already succeeded.
func (h *ContainerHandler) publishLifecycleEvent(ctx context.Context, eventType, containerID string) {
	payload := fmt.Sprintf(`{"event":%q,"container_id":%q,"ts":%q}`,
		eventType, containerID, time.Now().UTC().Format(time.RFC3339))
	if err := h.rdb.Publish(ctx, "dcms.container.events", payload).Err(); err != nil {
		h.logger.Warn("failed to publish lifecycle event",
			zap.String("event_type", eventType),
			zap.String("container_id", containerID),
			zap.Error(err),
		)
	}
}

// isNotFound returns true when err signals a "not found" condition.
// The service layer wraps repository errors with sentinel values.
func isNotFound(err error) bool {
	return err != nil && err.Error() == service.ErrContainerNotFound.Error()
}

// Ensure io.Writer is satisfied (compile-time guard for ResponseWriter).
var _ io.Writer = (http.ResponseWriter)(nil)
