// Package grpc implements the AgentService gRPC server that runs on each managed Docker host.
package grpc

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"time"

	dockertypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	docker "github.com/docker/docker/client"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	agentv1 "dcms/agent/gen/proto/agent/v1"
)

// AgentServer implements the AgentService gRPC service definition.
// It wraps the Moby SDK docker.Client connected to the local Docker daemon
// via the Unix socket (unix:///var/run/docker.sock).
type AgentServer struct {
	docker *docker.Client
	logger *zap.Logger
	agentv1.UnimplementedAgentServiceServer
}

// NewAgentServer constructs an AgentServer using the provided Moby SDK client.
func NewAgentServer(dockerClient *docker.Client, logger *zap.Logger) *AgentServer {
	return &AgentServer{
		docker: dockerClient,
		logger: logger,
	}
}

// --------------------------------------------------------------------------
// StartContainer
// --------------------------------------------------------------------------

// StartContainer starts a container identified by ContainerId. When the request
// also carries a non-empty Image field, a new container is created first using
// ContainerCreate then immediately started.
func (s *AgentServer) StartContainer(ctx context.Context, req *agentv1.StartContainerRequest) (*agentv1.StartContainerResponse, error) {
	if req.ContainerId == "" && req.Image == "" {
		return nil, status.Error(codes.InvalidArgument, "either container_id or image must be provided")
	}

	containerID := req.ContainerId

	// If no pre-existing container ID, create a new container first.
	if containerID == "" {
		createCfg := &container.Config{
			Image: req.Image,
			Env:   req.Env,
			Cmd:   req.Command,
		}

		hostCfg := &container.HostConfig{
			RestartPolicy: container.RestartPolicy{
				Name: container.RestartPolicyMode(req.RestartPolicy),
			},
		}

		resp, err := s.docker.ContainerCreate(ctx, createCfg, hostCfg, nil, nil, req.Name)
		if err != nil {
			s.logger.Error("ContainerCreate failed", zap.String("image", req.Image), zap.Error(err))
			return nil, status.Errorf(codes.Internal, "create container: %v", err)
		}
		containerID = resp.ID
	}

	if err := s.docker.ContainerStart(ctx, containerID, dockertypes.ContainerStartOptions{}); err != nil {
		s.logger.Error("ContainerStart failed", zap.String("container_id", containerID), zap.Error(err))
		return nil, status.Errorf(codes.Internal, "start container %s: %v", containerID, err)
	}

	s.logger.Info("container started", zap.String("container_id", containerID))

	return &agentv1.StartContainerResponse{
		ContainerId: containerID,
		Status:      "running",
	}, nil
}

// --------------------------------------------------------------------------
// StopContainer
// --------------------------------------------------------------------------

// StopContainer stops a running container with the specified timeout.
func (s *AgentServer) StopContainer(ctx context.Context, req *agentv1.StopContainerRequest) (*agentv1.StopContainerResponse, error) {
	if req.ContainerId == "" {
		return nil, status.Error(codes.InvalidArgument, "container_id is required")
	}

	timeout := int(req.TimeoutSeconds)
	if timeout <= 0 {
		timeout = 10
	}

	stopOptions := container.StopOptions{
		Timeout: &timeout,
	}

	if err := s.docker.ContainerStop(ctx, req.ContainerId, stopOptions); err != nil {
		s.logger.Error("ContainerStop failed", zap.String("container_id", req.ContainerId), zap.Error(err))
		return nil, status.Errorf(codes.Internal, "stop container %s: %v", req.ContainerId, err)
	}

	s.logger.Info("container stopped", zap.String("container_id", req.ContainerId))

	return &agentv1.StopContainerResponse{
		ContainerId: req.ContainerId,
		Status:      "stopped",
	}, nil
}

// --------------------------------------------------------------------------
// PauseContainer
// --------------------------------------------------------------------------

// PauseContainer suspends all processes in the container (SIGSTOP / cgroups freeze).
func (s *AgentServer) PauseContainer(ctx context.Context, req *agentv1.PauseContainerRequest) (*agentv1.PauseContainerResponse, error) {
	if req.ContainerId == "" {
		return nil, status.Error(codes.InvalidArgument, "container_id is required")
	}

	if err := s.docker.ContainerPause(ctx, req.ContainerId); err != nil {
		s.logger.Error("ContainerPause failed", zap.String("container_id", req.ContainerId), zap.Error(err))
		return nil, status.Errorf(codes.Internal, "pause container %s: %v", req.ContainerId, err)
	}

	return &agentv1.PauseContainerResponse{
		ContainerId: req.ContainerId,
		Status:      "paused",
	}, nil
}

// --------------------------------------------------------------------------
// RestartContainer
// --------------------------------------------------------------------------

// RestartContainer sends a stop signal followed by a start to the container.
func (s *AgentServer) RestartContainer(ctx context.Context, req *agentv1.RestartContainerRequest) (*agentv1.RestartContainerResponse, error) {
	if req.ContainerId == "" {
		return nil, status.Error(codes.InvalidArgument, "container_id is required")
	}

	timeout := int(req.TimeoutSeconds)
	if timeout <= 0 {
		timeout = 10
	}

	restartOptions := container.StopOptions{
		Timeout: &timeout,
	}

	if err := s.docker.ContainerRestart(ctx, req.ContainerId, restartOptions); err != nil {
		s.logger.Error("ContainerRestart failed", zap.String("container_id", req.ContainerId), zap.Error(err))
		return nil, status.Errorf(codes.Internal, "restart container %s: %v", req.ContainerId, err)
	}

	s.logger.Info("container restarted", zap.String("container_id", req.ContainerId))

	return &agentv1.RestartContainerResponse{
		ContainerId: req.ContainerId,
		Status:      "running",
	}, nil
}

// --------------------------------------------------------------------------
// GetContainerStats
// --------------------------------------------------------------------------

// dockerStatsJSON mirrors the top-level structure returned by the Docker stats API.
// Only the fields needed to populate ContainerStats are mapped.
type dockerStatsJSON struct {
	Read      time.Time `json:"read"`
	CPUStats  struct {
		CPUUsage struct {
			TotalUsage  uint64 `json:"total_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
		} `json:"cpu_usage"`
		OnlineCPUs   uint32 `json:"online_cpus"`
		SystemCPU    uint64 `json:"system_cpu_usage"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPU uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IOServiceBytesRecursive []struct {
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
}

// GetContainerStats fetches a single stats snapshot from the Docker daemon,
// decodes the CPU/memory/network/block-io metrics, and returns a structured
// ContainerStats response.
func (s *AgentServer) GetContainerStats(ctx context.Context, req *agentv1.GetContainerStatsRequest) (*agentv1.ContainerStats, error) {
	if req.ContainerId == "" {
		return nil, status.Error(codes.InvalidArgument, "container_id is required")
	}

	statsResp, err := s.docker.ContainerStats(ctx, req.ContainerId, false /* one-shot */)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "ContainerStats: %v", err)
	}
	defer statsResp.Body.Close()

	var raw dockerStatsJSON
	if err := json.NewDecoder(statsResp.Body).Decode(&raw); err != nil {
		return nil, status.Errorf(codes.Internal, "decode stats JSON: %v", err)
	}

	return buildContainerStats(req.ContainerId, &raw), nil
}

// --------------------------------------------------------------------------
// StreamContainerLogs
// --------------------------------------------------------------------------

// StreamContainerLogs is a server-streaming RPC that tails container log output
// and sends each log line as a LogChunk message. The stream continues until the
// context is cancelled by the client.
func (s *AgentServer) StreamContainerLogs(req *agentv1.StreamLogsRequest, stream agentv1.AgentService_StreamContainerLogsServer) error {
	if req.ContainerId == "" {
		return status.Error(codes.InvalidArgument, "container_id is required")
	}

	opts := dockertypes.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Timestamps: req.Timestamps,
		Tail:       strconv.FormatInt(req.TailLines, 10),
	}
	if req.TailLines <= 0 {
		opts.Tail = "100"
	}

	logReader, err := s.docker.ContainerLogs(stream.Context(), req.ContainerId, opts)
	if err != nil {
		return status.Errorf(codes.Internal, "ContainerLogs: %v", err)
	}
	defer logReader.Close()

	scanner := bufio.NewScanner(logReader)
	// Docker multiplexes stdout/stderr in a binary framing; for simplicity we
	// use a scanner and strip the 8-byte header on each frame.
	// See: https://docs.docker.com/engine/api/v1.43/#tag/Container/operation/ContainerAttach
	for scanner.Scan() {
		select {
		case <-stream.Context().Done():
			return nil
		default:
		}

		line := scanner.Text()
		// Strip the Docker stream framing header (8 bytes) when present.
		if len(line) > 8 {
			line = line[8:]
		}

		if err := stream.Send(&agentv1.LogChunk{
			ContainerId: req.ContainerId,
			Line:        line,
			Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
			Stream:      "stdout",
		}); err != nil {
			return err
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		return status.Errorf(codes.Internal, "log scanner: %v", err)
	}

	return nil
}

// --------------------------------------------------------------------------
// ListContainers
// --------------------------------------------------------------------------

// ListContainers returns a filtered list of containers visible on this Docker host.
func (s *AgentServer) ListContainers(ctx context.Context, req *agentv1.ListContainersRequest) (*agentv1.ListContainersResponse, error) {
	opts := dockertypes.ContainerListOptions{
		All: req.All,
	}

	if len(req.StatusFilter) > 0 {
		f := filters.NewArgs()
		for _, st := range req.StatusFilter {
			f.Add("status", st)
		}
		opts.Filters = f
	}

	containers, err := s.docker.ContainerList(ctx, opts)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "ContainerList: %v", err)
	}

	items := make([]*agentv1.ContainerListItem, 0, len(containers))
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}
		items = append(items, &agentv1.ContainerListItem{
			ContainerId: c.ID,
			Name:        name,
			Image:       c.Image,
			Status:      c.Status,
			State:       c.State,
			Created:     c.Created,
		})
	}

	return &agentv1.ListContainersResponse{Containers: items}, nil
}

// --------------------------------------------------------------------------
// Heartbeat
// --------------------------------------------------------------------------

// Heartbeat is called periodically by the cluster-service to verify that the
// agent is reachable and to collect basic host information.
func (s *AgentServer) Heartbeat(ctx context.Context, req *agentv1.HeartbeatRequest) (*agentv1.HeartbeatResponse, error) {
	return &agentv1.HeartbeatResponse{
		AgentId:   req.AgentId,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Status:    "ok",
	}, nil
}

// --------------------------------------------------------------------------
// Stats helpers
// --------------------------------------------------------------------------

// buildContainerStats converts a raw Docker stats payload to the proto response type.
func buildContainerStats(containerID string, raw *dockerStatsJSON) *agentv1.ContainerStats {
	// CPU %: delta(totalUsage) / delta(systemUsage) * numCPUs * 100
	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage - raw.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(raw.CPUStats.SystemCPU - raw.PreCPUStats.SystemCPU)
	numCPUs := float64(raw.CPUStats.OnlineCPUs)
	if numCPUs == 0 {
		numCPUs = 1
	}

	var cpuPercent float64
	if sysDelta > 0 {
		cpuPercent = (cpuDelta / sysDelta) * numCPUs * 100.0
	}

	// Network totals across all interfaces.
	var rxBytes, txBytes uint64
	for _, iface := range raw.Networks {
		rxBytes += iface.RxBytes
		txBytes += iface.TxBytes
	}

	// Block I/O totals.
	var blockRead, blockWrite uint64
	for _, entry := range raw.BlkioStats.IOServiceBytesRecursive {
		switch entry.Op {
		case "Read":
			blockRead += entry.Value
		case "Write":
			blockWrite += entry.Value
		}
	}

	memUsageMB := float64(raw.MemoryStats.Usage) / (1024 * 1024)
	memLimitMB := float64(raw.MemoryStats.Limit) / (1024 * 1024)

	return &agentv1.ContainerStats{
		ContainerId: containerID,
		CpuPercent:  fmt.Sprintf("%.2f", cpuPercent),
		MemUsageMb:  fmt.Sprintf("%.2f", memUsageMB),
		MemLimitMb:  fmt.Sprintf("%.2f", memLimitMB),
		NetRxBytes:  rxBytes,
		NetTxBytes:  txBytes,
		BlockRead:   blockRead,
		BlockWrite:  blockWrite,
		Timestamp:   raw.Read.UTC().Format(time.RFC3339),
	}
}
