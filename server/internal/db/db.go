package db

import (
	"database/sql"
	"strings"
	"time"

	"sparklab/server/internal/model"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func Open(path string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	// 启用外键约束（SQLite 必须显式启用）
	db.Exec("PRAGMA foreign_keys = ON")
	// 并发：WAL 允许多读一写；busy_timeout 避免短时锁竞争直接失败
	_ = db.Exec("PRAGMA journal_mode=WAL").Error
	_ = db.Exec("PRAGMA busy_timeout=5000").Error

	var sqlDB *sql.DB
	sqlDB, err = db.DB()
	if err == nil {
		// 多请求并行读元数据；写仍序列化，由 busy_timeout 排队
		sqlDB.SetMaxOpenConns(8)
		sqlDB.SetMaxIdleConns(8)
		sqlDB.SetConnMaxLifetime(time.Hour)
	}

	err = db.AutoMigrate(
		&model.User{},
		&model.Class{},
		&model.GroupMembership{},
		&model.Course{},
		&model.CourseClassLink{},
		&model.CourseMaterial{},
		&model.MaterialProgress{},
		&model.Lab{},
		&model.Step{},
		&model.Enrollment{},
		&model.Submission{},
		&model.Container{},
		&model.Server{},
		&model.Question{},
		&model.Answer{},
		&model.VideoProgress{},
		&model.ActivityLog{},
	)
	if err != nil {
		return nil, err
	}

	if err := migrateLegacyStudentGroups(db); err != nil {
		return nil, err
	}

	if err := migrateCourseClassLinks(db); err != nil {
		return nil, err
	}

	return db, nil
}

func migrateCourseClassLinks(db *gorm.DB) error {
	type row struct {
		ID      string  `gorm:"column:id"`
		ClassID *string `gorm:"column:classId"`
	}
	var rows []row
	if err := db.Table("courses").Select("id, classId").Where("classId IS NOT NULL AND TRIM(classId) != ''").Find(&rows).Error; err != nil {
		return err
	}
	for _, r := range rows {
		if r.ClassID == nil {
			continue
		}
		gid := strings.TrimSpace(*r.ClassID)
		if gid == "" {
			continue
		}
		var n int64
		if err := db.Model(&model.CourseClassLink{}).Where("courseId = ? AND classId = ?", r.ID, gid).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		link := model.CourseClassLink{
			ID:        strings.ReplaceAll(uuid.New().String(), "-", ""),
			CourseID:  r.ID,
			ClassID:   gid,
			CreatedAt: model.Now(),
		}
		if err := db.Create(&link).Error; err != nil {
			return err
		}
	}
	return nil
}

func migrateLegacyStudentGroups(db *gorm.DB) error {
	type row struct {
		ID      string  `gorm:"column:id"`
		ClassID *string `gorm:"column:classId"`
	}
	var rows []row
	if err := db.Table("users").Select("id, classId").Where("role = ? AND classId IS NOT NULL AND TRIM(classId) != ''", "STUDENT").Find(&rows).Error; err != nil {
		return err
	}
	for _, r := range rows {
		if r.ClassID == nil {
			continue
		}
		cid := strings.TrimSpace(*r.ClassID)
		if cid == "" {
			continue
		}
		var n int64
		if err := db.Model(&model.GroupMembership{}).Where("userId = ? AND classId = ?", r.ID, cid).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		gm := model.GroupMembership{
			ID:        strings.ReplaceAll(uuid.New().String(), "-", ""),
			UserID:    r.ID,
			ClassID:   cid,
			CreatedAt: model.Now(),
		}
		if err := db.Create(&gm).Error; err != nil {
			return err
		}
	}
	return nil
}
