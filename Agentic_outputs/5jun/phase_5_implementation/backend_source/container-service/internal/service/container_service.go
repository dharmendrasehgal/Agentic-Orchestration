// Package service implements the business logic for the container-service.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"dcms/container-service/internal/model"
	agentv1 "dcms/container-service/gen/proto/agent/v1"
	sharedgrpc "dcms/container-service/internal/grpc"
)

// ErrContainerNotFound is returned when a container cannot be located.
var ErrContainerNotFound = errors.New("container not found")

// ErrNoAvailableHost is returned when no suitable host can be selected for placement.
var ErrNoAvailableHost = errors.New("no available host for container placement")

// --------------------------------------------------------------------------
// Interfaces (allows mocking in tests)
// --------------------------------------------------------------------------

// ContainerRepository defines the data-access contract for container persistence.
type ContainerRepository interface {
	FindAll(ctx context.Context, filter ContainerFilter) ([]*model.Container, int64, error)
	FindByID(ctx context.Context, id string) (*model.Container, error)
	Create(ctx context.Context, c *model.Container) error
	UpdateStatus(ctx context.Context, id, status string) error
	SoftDelete(ctx context.Context, id string) error
}

// AgentClient defines the gRPC client contract used to reach per-host agents.
type AgentClient interface {
	StartContainer(ctx context.Context, hostID string, req *agentv1.StartContainerRequest) (*agentv1.StartContainerResponse, error)
	StopContainer(ctx context.Context, hostID string, req *agentv1.StopContainerRequest) (*agentv1.StopContainerResponse, error)
	RestartContainer(ctx context.Context, hostID string, req *agentv1.RestartContainerRequest) (*agentv1.RestartContainerResponse, error)
	GetStats(ctx context.Context, hostID string, containerID string) (<-chan *agentv1.ContainerStats, <-chan error)
}

// HostSelector picks the most suitable host for a new container.
type HostSelector interface {
	SelectHost(ctx context.Context, cpuQuota float64, memoryMB int64) (string, string, error) // returns hostID, hostAddr
}

// --------------------------------------------------------------------------
// DTOs
// --------------------------------------------------------------------------

// ContainerFilter carries query parameters for ListContainers.
type ContainerFilter struct {
	Namespace string
	Status    string
	Page      int
	PageSize  int
}

// CreateContainerRequest is the input DTO for creating a new container.
type CreateContainerRequest struct {
	Name          string
	Image         string
	NamespaceID   string
	Env           map[string]string
	Ports         []model.PortSpec
	Volumes       []model.VolumeMount
	Labels        map[string]string
	RestartPolicy string
	CPUQuota      float64
	MemoryMB      int64
	Command       []string
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

// ContainerService implements container lifecycle business logic.
type ContainerService struct {
	repo     ContainerRepository
	agent    AgentClient
	selector HostSelector
	rdb      *redis.Client
	logger   *zap.Logger
	tracer   trace.Tracer
}

// NewContainerService constructs a ContainerService with all required dependencies.
func NewContainerService(
	repo ContainerRepository,
	agent AgentClient,
	selector HostSelector,
	rdb *redis.Client,
	logger *zap.Logger,
	tracer trace.Tracer,
) *ContainerService {
	return &ContainerService{
		repo:     repo,
		agent:    agent,
		selector: selector,
		rdb:      rdb,
		logger:   logger,
		tracer:   tracer,
	}
}

// Ensure *ContainerService satisfies the ContainerServiceIface at compile time.
// (Used by handler and tests to reference the concrete type via the interface.)
var _ sharedgrpc.ContainerServiceIface = (*ContainerService)(nil)

// ListContainers returns a paginated list of containers matching the filter.
func (s *ContainerService) ListContainers(ctx context.Context, filter ContainerFilter) ([]*model.Container, int64, error) {
	ctx, span := s.tracer.Start(ctx, "ContainerService.ListContainers")
	defer span.End()

	span.SetAttributes(
		attribute.String("namespace", filter.Namespace),
		attribute.String("status", filter.Status),
		attribute.Int("page", filter.Page),
		attribute.Int("page_size", filter.PageSize),
	)

	containers, total, err := s.repo.FindAll(ctx, filter)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, 0, fmt.Errorf("repository.FindAll: %w", err)
	}

	return containers, total, nil
}

// GetContainer retrieves a single container by its UUID.
// Returns ErrContainerNotFound when the container does not exist or has been soft-deleted.
func (s *ContainerService) GetContainer(ctx context.Context, id string) (*model.Container, error) {
	ctx, span := s.tracer.Start(ctx, "ContainerService.GetContainer",
		trace.WithAttributes(attribute.String("container.id", id)))
	defer span.End()

	container, err := s.repo.FindByID(ctx, id)
	if err != nil {
		span.RecordError(err)
		if errors.Is(err, ErrContainerNotFound) {
			span.SetStatus(codes.Error, "not found")
			return nil, ErrContainerNotFound
		}
		span.SetStatus(codes.Error, err.Error())
		return nil, fmt.Errorf("repository.FindByID: %w", err)
	}

	return container, nil
}

// CreateContainer selects an appropriate host, calls the agent to start the
// container on the Docker daemon, persists the container metadata, and
// publishes a creation event to Redis.
func (s *ContainerService) CreateContainer(ctx context.Context, req CreateContainerRequest) (*model.Container, error) {
	ctx, span := s.tracer.Start(ctx, "ContainerService.CreateContainer",
		trace.WithAttributes(
			attribute.String("container.image", req.Image),
			attribute.String("namespace.id", req.NamespaceID),
		))
	defer span.End()

	// 1. Select the host with the most available resources.
	hostID, hostAddr, err := s.selector.SelectHost(ctx, req.CPUQuota, req.MemoryMB)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "host selection failed")
		return nil, fmt.Errorf("host selection: %w", err)
	}

	span.SetAttributes(attribute.String("host.id", hostID), attribute.String("host.addr", hostAddr))

	// 2. Build the environment variable slice expected by the agent proto.
	envList := make([]string, 0, len(req.Env))
	for k, v := range req.Env {
		envList = append(envList, fmt.Sprintf("%s=%s", k, v))
	}

	// 3. Call the agent gRPC endpoint.
	agentReq := &agentv1.StartContainerRequest{
		Name:          req.Name,
		Image:         req.Image,
		Env:           envList,
		Command:       req.Command,
		RestartPolicy: req.RestartPolicy,
	}

	agentResp, err := s.agent.StartContainer(ctx, hostID, agentReq)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "agent.StartContainer failed")
		return nil, fmt.Errorf("agent.StartContainer: %w", err)
	}

	// 4. Persist the container metadata snapshot.
	now := time.Now().UTC()
	container := &model.Container{
		ID:            uuid.New().String(),
		DockerID:      agentResp.ContainerId,
		Name:          req.Name,
		Image:         req.Image,
		Status:        model.StatusRunning,
		NamespaceID:   req.NamespaceID,
		HostID:        hostID,
		Labels:        req.Labels,
		RestartPolicy: req.RestartPolicy,
		CPUQuota:      req.CPUQuota,
		MemoryMB:      req.MemoryMB,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.repo.Create(ctx, container); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "repository.Create failed")
		return nil, fmt.Errorf("repository.Create: %w", err)
	}

	// 5. Publish creation event (non-fatal).
	s.publishEvent(ctx, "container.created", container)

	s.logger.Info("container created",
		zap.String("container_id", container.ID),
		zap.String("docker_id", container.DockerID),
		zap.String("host_id", hostID),
	)

	return container, nil
}

// StartContainer transitions a stopped container to running state.
func (s *ContainerService) StartContainer(ctx context.Context, id string) error {
	ctx, span := s.tracer.Start(ctx, "ContainerService.StartContainer",
		trace.WithAttributes(attribute.String("container.id", id)))
	defer span.End()

	container, err := s.repo.FindByID(ctx, id)
	if err != nil {
		span.RecordError(err)
		if errors.Is(err, ErrContainerNotFound) {
			return ErrContainerNotFound
		}
		return fmt.Errorf("repository.FindByID: %w", err)
	}

	req := &agentv1.StartContainerRequest{
		ContainerId: container.DockerID,
	}

	if _, err := s.agent.StartContainer(ctx, container.HostID, req); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "agent.StartContainer failed")
		return fmt.Errorf("agent.StartContainer: %w", err)
	}

	if err := s.repo.UpdateStatus(ctx, id, model.StatusRunning); err != nil {
		span.RecordError(err)
		return fmt.Errorf("repository.UpdateStatus: %w", err)
	}

	s.publishEvent(ctx, "container.started", container)
	return nil
}

// StopContainer sends a stop signal to the container's host agent.
func (s *ContainerService) StopContainer(ctx context.Context, id string) error {
	ctx, span := s.tracer.Start(ctx, "ContainerService.StopContainer",
		trace.WithAttributes(attribute.String("container.id", id)))
	defer span.End()

	container, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrContainerNotFound) {
			return ErrContainerNotFound
		}
		return fmt.Errorf("repository.FindByID: %w", err)
	}

	req := &agentv1.StopContainerRequest{
		ContainerId:    container.DockerID,
		TimeoutSeconds: 30,
	}

	if _, err := s.agent.StopContainer(ctx, container.HostID, req); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "agent.StopContainer failed")
		return fmt.Errorf("agent.StopContainer: %w", err)
	}

	if err := s.repo.UpdateStatus(ctx, id, model.StatusStopped); err != nil {
		return fmt.Errorf("repository.UpdateStatus: %w", err)
	}

	s.publishEvent(ctx, "container.stopped", container)
	return nil
}

// RestartContainer restarts a running or stopped container.
func (s *ContainerService) RestartContainer(ctx context.Context, id string) error {
	ctx, span := s.tracer.Start(ctx, "ContainerService.RestartContainer",
		trace.WithAttributes(attribute.String("container.id", id)))
	defer span.End()

	container, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrContainerNotFound) {
			return ErrContainerNotFound
		}
		return fmt.Errorf("repository.FindByID: %w", err)
	}

	req := &agentv1.RestartContainerRequest{
		ContainerId:    container.DockerID,
		TimeoutSeconds: 30,
	}

	if _, err := s.agent.RestartContainer(ctx, container.HostID, req); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "agent.RestartContainer failed")
		return fmt.Errorf("agent.RestartContainer: %w", err)
	}

	if err := s.repo.UpdateStatus(ctx, id, model.StatusRunning); err != nil {
		return fmt.Errorf("repository.UpdateStatus: %w", err)
	}

	s.publishEvent(ctx, "container.restarted", container)
	return nil
}

// DeleteContainer soft-deletes the container record and publishes a deletion event.
func (s *ContainerService) DeleteContainer(ctx context.Context, id string) error {
	ctx, span := s.tracer.Start(ctx, "ContainerService.DeleteContainer",
		trace.WithAttributes(attribute.String("container.id", id)))
	defer span.End()

	container, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrContainerNotFound) {
			return ErrContainerNotFound
		}
		return fmt.Errorf("repository.FindByID: %w", err)
	}

	if err := s.repo.SoftDelete(ctx, id); err != nil {
		span.RecordError(err)
		return fmt.Errorf("repository.SoftDelete: %w", err)
	}

	s.publishEvent(ctx, "container.deleted", container)
	return nil
}

// StreamContainerStats opens a gRPC server-streaming call to the agent on the
// container's host and relays stats frames over the returned channels.
// The caller must drain both channels. errCh is closed after the last error
// or when the context is cancelled.
func (s *ContainerService) StreamContainerStats(ctx context.Context, hostID, containerID string) (<-chan *agentv1.ContainerStats, <-chan error) {
	return s.agent.GetStats(ctx, hostID, containerID)
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

// containerEvent is the payload published to the Redis pub/sub channel.
type containerEvent struct {
	EventType   string           `json:"event_type"`
	ContainerID string           `json:"container_id"`
	DockerID    string           `json:"docker_id"`
	Name        string           `json:"name"`
	Status      string           `json:"status"`
	HostID      string           `json:"host_id"`
	Timestamp   string           `json:"timestamp"`
}

// publishEvent serialises the container state and publishes it to the
// dcms.container.events Redis channel. Errors are logged but not returned to
// callers because event publishing is a best-effort side-effect.
func (s *ContainerService) publishEvent(ctx context.Context, eventType string, container *model.Container) {
	evt := containerEvent{
		EventType:   eventType,
		ContainerID: container.ID,
		DockerID:    container.DockerID,
		Name:        container.Name,
		Status:      container.Status,
		HostID:      container.HostID,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		s.logger.Error("failed to marshal container event", zap.Error(err))
		return
	}

	if err := s.rdb.Publish(ctx, "dcms.container.events", payload).Err(); err != nil {
		s.logger.Warn("failed to publish container event",
			zap.String("event_type", eventType),
			zap.String("container_id", container.ID),
			zap.Error(err),
		)
	}
}
