// Package grpc provides a pooled mTLS gRPC client for communicating with per-host agents.
package grpc

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"os"
	"sync"

	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"

	agentv1 "dcms/proto/agent/v1"
)

// AgentClientConfig holds the mTLS certificate material needed to authenticate
// the DCMS control-plane as a trusted gRPC client to the host agents.
type AgentClientConfig struct {
	// ClientCertPath is the path to the PEM-encoded client certificate.
	ClientCertPath string
	// ClientKeyPath is the path to the PEM-encoded client private key.
	ClientKeyPath string
	// CACertPath is the path to the PEM-encoded CA certificate that signed agent server certs.
	CACertPath string
}

// AgentClient maintains a pool of mTLS gRPC connections indexed by hostID.
// Connections are created lazily on first use and reused for subsequent calls.
type AgentClient struct {
	conns  map[string]*grpc.ClientConn // hostID → established connection
	mu     sync.RWMutex
	tlsCfg *tls.Config
}

// NewAgentClient constructs an AgentClient by loading the mTLS certificate material
// from the paths specified in cfg. Returns an error when any file cannot be read
// or the certificate material is malformed.
func NewAgentClient(cfg AgentClientConfig) (*AgentClient, error) {
	tlsCfg, err := buildMTLSConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("build mTLS config: %w", err)
	}

	return &AgentClient{
		conns:  make(map[string]*grpc.ClientConn),
		tlsCfg: tlsCfg,
	}, nil
}

// GetConn returns (or lazily creates) an authenticated gRPC connection to the
// agent running at addr on the host identified by hostID. The returned
// AgentServiceClient is safe to call from multiple goroutines; the underlying
// connection is shared.
func (a *AgentClient) GetConn(hostID, addr string) (agentv1.AgentServiceClient, error) {
	// Fast path: connection already exists.
	a.mu.RLock()
	conn, ok := a.conns[hostID]
	a.mu.RUnlock()
	if ok {
		return agentv1.NewAgentServiceClient(conn), nil
	}

	// Slow path: create and cache a new connection.
	a.mu.Lock()
	defer a.mu.Unlock()

	// Double-check after acquiring the write lock.
	if conn, ok = a.conns[hostID]; ok {
		return agentv1.NewAgentServiceClient(conn), nil
	}

	creds := credentials.NewTLS(a.tlsCfg)
	conn, err := grpc.NewClient(addr,
		grpc.WithTransportCredentials(creds),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
	)
	if err != nil {
		return nil, fmt.Errorf("dial agent at %s: %w", addr, err)
	}

	a.conns[hostID] = conn
	return agentv1.NewAgentServiceClient(conn), nil
}

// StartContainer calls the agent's StartContainer RPC on the named host.
func (a *AgentClient) StartContainer(ctx context.Context, hostID, addr string, req *agentv1.StartContainerRequest) (*agentv1.StartContainerResponse, error) {
	client, err := a.GetConn(hostID, addr)
	if err != nil {
		return nil, err
	}
	return client.StartContainer(ctx, req)
}

// StopContainer calls the agent's StopContainer RPC on the named host.
func (a *AgentClient) StopContainer(ctx context.Context, hostID, addr string, req *agentv1.StopContainerRequest) (*agentv1.StopContainerResponse, error) {
	client, err := a.GetConn(hostID, addr)
	if err != nil {
		return nil, err
	}
	return client.StopContainer(ctx, req)
}

// GetStats opens a server-streaming RPC to the agent and relays ContainerStats
// frames over the returned channel. The error channel receives at most one value
// (the stream error) before being closed. The stats channel is closed when the
// stream ends or the context is cancelled.
func (a *AgentClient) GetStats(ctx context.Context, hostID, addr, containerID string) (<-chan *agentv1.ContainerStats, <-chan error) {
	statsCh := make(chan *agentv1.ContainerStats, 16)
	errCh := make(chan error, 1)

	go func() {
		defer close(statsCh)
		defer close(errCh)

		client, err := a.GetConn(hostID, addr)
		if err != nil {
			errCh <- err
			return
		}

		stream, err := client.GetContainerStats(ctx, &agentv1.GetContainerStatsRequest{
			ContainerId: containerID,
		})
		if err != nil {
			errCh <- fmt.Errorf("GetContainerStats stream: %w", err)
			return
		}

		for {
			stat, err := stream.Recv()
			if err != nil {
				if err != io.EOF {
					errCh <- err
				}
				return
			}
			select {
			case statsCh <- stat:
			case <-ctx.Done():
				return
			}
		}
	}()

	return statsCh, errCh
}

// Close terminates all cached connections. Should be called on service shutdown.
func (a *AgentClient) Close() {
	a.mu.Lock()
	defer a.mu.Unlock()

	for hostID, conn := range a.conns {
		_ = conn.Close()
		delete(a.conns, hostID)
	}
}

// --------------------------------------------------------------------------
// mTLS helpers
// --------------------------------------------------------------------------

// buildMTLSConfig constructs a *tls.Config from the supplied certificate paths.
func buildMTLSConfig(cfg AgentClientConfig) (*tls.Config, error) {
	// Load client certificate and key.
	cert, err := tls.LoadX509KeyPair(cfg.ClientCertPath, cfg.ClientKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load client cert/key: %w", err)
	}

	// Load the CA certificate pool.
	caCertPEM, err := os.ReadFile(cfg.CACertPath)
	if err != nil {
		return nil, fmt.Errorf("read CA cert %s: %w", cfg.CACertPath, err)
	}

	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCertPEM) {
		return nil, fmt.Errorf("failed to parse CA certificate from %s", cfg.CACertPath)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caPool,
		MinVersion:   tls.VersionTLS13,
	}, nil
}
