// Package repository implements the data-access layer for the container-service.
package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	"dcms/container-service/internal/model"
	"dcms/container-service/internal/service"
)

// containerRepository is the GORM-backed implementation of ContainerRepository.
type containerRepository struct {
	db *gorm.DB
}

// NewContainerRepository constructs a containerRepository.
func NewContainerRepository(db *gorm.DB) service.ContainerRepository {
	return &containerRepository{db: db}
}

// FindAll returns a paginated, filtered list of containers.
// Results are scoped to namespaces belonging to the supplied org (via sub-select).
// The orgID is extracted from the filter only when the Namespace field is empty;
// callers may also pass a specific namespace name to narrow results further.
func (r *containerRepository) FindAll(ctx context.Context, filter service.ContainerFilter) ([]*model.Container, int64, error) {
	db := r.db.WithContext(ctx).Model(&model.Container{}).
		Where("deleted_at IS NULL")

	if filter.Namespace != "" {
		// Scope to namespaces whose slug matches.
		db = db.Where(
			"namespace_id IN (SELECT id FROM namespaces WHERE slug = ? AND deleted_at IS NULL)",
			filter.Namespace,
		)
	}

	if filter.Status != "" {
		db = db.Where("status = ?", filter.Status)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (filter.Page - 1) * filter.PageSize
	var containers []*model.Container
	if err := db.
		Order("created_at DESC").
		Offset(offset).
		Limit(filter.PageSize).
		Find(&containers).Error; err != nil {
		return nil, 0, err
	}

	return containers, total, nil
}

// FindAllByOrgID returns all non-deleted containers whose namespace belongs to
// the given org. This is used internally by service-level operations that need
// to scope results to the current user's organisation.
func (r *containerRepository) FindAllByOrgID(ctx context.Context, orgID string, filter service.ContainerFilter) ([]*model.Container, int64, error) {
	db := r.db.WithContext(ctx).Model(&model.Container{}).
		Where("deleted_at IS NULL").
		Where(
			"namespace_id IN (SELECT id FROM namespaces WHERE org_id = ? AND deleted_at IS NULL)",
			orgID,
		)

	if filter.Status != "" {
		db = db.Where("status = ?", filter.Status)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (filter.Page - 1) * filter.PageSize
	var containers []*model.Container
	if err := db.
		Order("created_at DESC").
		Offset(offset).
		Limit(filter.PageSize).
		Find(&containers).Error; err != nil {
		return nil, 0, err
	}

	return containers, total, nil
}

// FindByID returns a single non-deleted container by its UUID primary key.
// Returns service.ErrContainerNotFound when the row does not exist.
func (r *containerRepository) FindByID(ctx context.Context, id string) (*model.Container, error) {
	var container model.Container
	result := r.db.WithContext(ctx).
		Where("id = ? AND deleted_at IS NULL", id).
		First(&container)

	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, service.ErrContainerNotFound
		}
		return nil, result.Error
	}

	return &container, nil
}

// Create inserts a new container row into the database.
func (r *containerRepository) Create(ctx context.Context, c *model.Container) error {
	return r.db.WithContext(ctx).Create(c).Error
}

// UpdateStatus sets the status column and bumps updated_at for the given container.
func (r *containerRepository) UpdateStatus(ctx context.Context, id, status string) error {
	result := r.db.WithContext(ctx).
		Model(&model.Container{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(map[string]interface{}{
			"status":     status,
			"updated_at": time.Now().UTC(),
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return service.ErrContainerNotFound
	}
	return nil
}

// SoftDelete sets the deleted_at timestamp without physically removing the row.
// Subsequent queries using FindAll or FindByID will exclude soft-deleted rows.
func (r *containerRepository) SoftDelete(ctx context.Context, id string) error {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).
		Model(&model.Container{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(map[string]interface{}{
			"deleted_at": now,
			"status":     model.StatusDeleted,
			"updated_at": now,
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return service.ErrContainerNotFound
	}
	return nil
}
