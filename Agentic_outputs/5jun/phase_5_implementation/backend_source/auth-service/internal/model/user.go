// Package model defines GORM model structs for the auth-service.
package model

import "time"

// AccountStatus values.
const (
	AccountStatusActive    = "active"
	AccountStatusSuspended = "suspended"
	AccountStatusPending   = "pending"
)

// User represents an authenticated principal stored in the auth-service database.
type User struct {
	ID             string     `gorm:"type:uuid;primaryKey"              json:"id"`
	Email          string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	PasswordHash   string     `gorm:"type:text;not null"                json:"-"`
	OrgID          string     `gorm:"type:uuid;not null;index"          json:"org_id"`
	Roles          []string   `gorm:"serializer:json"                   json:"roles"`
	AccountStatus  string     `gorm:"type:varchar(32);not null;default:'active'" json:"account_status"`
	LastLoginAt    *time.Time `json:"last_login_at,omitempty"`
	CreatedAt      time.Time  `gorm:"autoCreateTime"                    json:"created_at"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime"                    json:"updated_at"`
	DeletedAt      *time.Time `gorm:"index"                             json:"deleted_at,omitempty"`
}

// TableName overrides GORM's default table name.
func (User) TableName() string { return "users" }
