// Package grpc provides shared interface types used across the container-service packages.
// Placing the ContainerServiceIface here avoids import cycles between handler and service.
package grpc

import (
	"context"

	"dcms/container-service/internal/model"
	agentv1 "dcms/container-service/gen/proto/agent/v1"
)

// ContainerServiceIface is the full interface implemented by *service.ContainerService.
// Handler and test code depend on this interface rather than the concrete type so that
// mock implementations can be injected during testing.
type ContainerServiceIface interface {
	ListContainers(ctx context.Context, filter interface{}) ([]*model.Container, int64, error)
	GetContainer(ctx context.Context, id string) (*model.Container, error)
	CreateContainer(ctx context.Context, req interface{}) (*model.Container, error)
	StartContainer(ctx context.Context, id string) error
	StopContainer(ctx context.Context, id string) error
	RestartContainer(ctx context.Context, id string) error
	DeleteContainer(ctx context.Context, id string) error
	StreamContainerStats(ctx context.Context, hostID, containerID string) (<-chan *agentv1.ContainerStats, <-chan error)
}
