// Package model defines GORM model structs for the container-service.
package model

import "time"

// Container status constants.
const (
	StatusRunning = "running"
	StatusStopped = "stopped"
	StatusPaused  = "paused"
	StatusCreated = "created"
	StatusDeleted = "deleted"
	StatusError   = "error"
)

// Container represents a managed Docker container's metadata stored in Postgres.
// The actual container runs on a remote Docker host accessed via the agent gRPC API.
type Container struct {
	ID            string            `gorm:"type:uuid;primaryKey"              json:"id"`
	DockerID      string            `gorm:"type:varchar(64);not null;index"   json:"docker_id"`
	Name          string            `gorm:"type:varchar(255);not null;index"  json:"name"`
	Image         string            `gorm:"type:text;not null"                json:"image"`
	Status        string            `gorm:"type:varchar(32);not null;index"   json:"status"`
	NamespaceID   string            `gorm:"type:uuid;not null;index"          json:"namespace_id"`
	HostID        string            `gorm:"type:varchar(255);not null"        json:"host_id"`
	Labels        map[string]string `gorm:"serializer:json"                   json:"labels,omitempty"`
	RestartPolicy string            `gorm:"type:varchar(64)"                  json:"restart_policy"`
	CPUQuota      float64           `gorm:"type:float"                        json:"cpu_quota"`
	MemoryMB      int64             `gorm:"type:bigint"                       json:"memory_mb"`
	CreatedAt     time.Time         `gorm:"autoCreateTime"                    json:"created_at"`
	UpdatedAt     time.Time         `gorm:"autoUpdateTime"                    json:"updated_at"`
	DeletedAt     *time.Time        `gorm:"index"                             json:"deleted_at,omitempty"`
}

// TableName overrides GORM's default table name derivation.
func (Container) TableName() string { return "containers" }

// PortSpec defines a host-to-container port mapping.
type PortSpec struct {
	HostPort      int    `json:"host_port"      binding:"min=1,max=65535"`
	ContainerPort int    `json:"container_port" binding:"required,min=1,max=65535"`
	Protocol      string `json:"protocol"` // tcp or udp; defaults to tcp
}

// VolumeMount defines a volume bind mount for a container.
type VolumeMount struct {
	Source   string `json:"source"    binding:"required"` // host path or named volume
	Target   string `json:"target"    binding:"required"` // container path
	ReadOnly bool   `json:"read_only"`
}
