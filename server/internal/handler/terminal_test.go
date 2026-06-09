package handler

import (
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"sparklab/server/internal/db"
	"sparklab/server/internal/model"
)

func TestValidateAdminTerminalContainer(t *testing.T) {
	h := newTerminalTestHandler(t)

	okServer := "local-docker"
	otherServer := "other-docker"
	nowUnix := model.Now()
	now := time.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "terminal-user", Username: "terminal-user", DisplayName: "Student", Role: "STUDENT", CreatedAt: nowUnix, UpdatedAt: nowUnix, LastActiveAt: nowUnix}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "terminal-course", Title: "Terminal Course", IsActive: true, CreatedAt: nowUnix, UpdatedAt: nowUnix}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "terminal-lab", CourseID: "terminal-course", Type: "lab", Title: "Terminal Lab", CreatedAt: nowUnix, UpdatedAt: nowUnix}).Error)

	mustCreate(t, h.db.Create(&model.Container{
		ID:           "terminal-running",
		UserID:       "terminal-user",
		LabID:        "terminal-lab",
		ServerID:     &okServer,
		ContainerID:  "docker-running",
		Status:       "running",
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error)
	mustCreate(t, h.db.Create(&model.Container{
		ID:           "terminal-foreign",
		UserID:       "terminal-user",
		LabID:        "terminal-lab",
		ServerID:     &otherServer,
		ContainerID:  "docker-foreign",
		Status:       "running",
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error)
	mustCreate(t, h.db.Create(&model.Container{
		ID:           "terminal-stopped",
		UserID:       "terminal-user",
		LabID:        "terminal-lab",
		ServerID:     &okServer,
		ContainerID:  "docker-stopped",
		Status:       "stopped",
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error)
	mustCreate(t, h.db.Create(&model.Container{
		ID:           "terminal-unbound",
		UserID:       "terminal-user",
		LabID:        "terminal-lab",
		ContainerID:  "docker-unbound",
		Status:       "running",
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error)

	tests := []struct {
		name          string
		serverID      string
		containerID   string
		wantStatus    int
		wantContainer string
	}{
		{
			name:          "accepts managed running container on requested server",
			serverID:      okServer,
			containerID:   "docker-running",
			wantStatus:    http.StatusOK,
			wantContainer: "terminal-running",
		},
		{
			name:        "rejects unknown Docker container",
			serverID:    okServer,
			containerID: "host-nginx",
			wantStatus:  http.StatusNotFound,
		},
		{
			name:        "rejects container from another server",
			serverID:    okServer,
			containerID: "docker-foreign",
			wantStatus:  http.StatusForbidden,
		},
		{
			name:        "rejects stopped container",
			serverID:    okServer,
			containerID: "docker-stopped",
			wantStatus:  http.StatusConflict,
		},
		{
			name:        "rejects legacy unbound container",
			serverID:    okServer,
			containerID: "docker-unbound",
			wantStatus:  http.StatusForbidden,
		},
		{
			name:        "rejects empty server",
			serverID:    "",
			containerID: "docker-running",
			wantStatus:  http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, status, message := h.validateAdminTerminalContainer(tt.serverID, tt.containerID)
			if status != tt.wantStatus {
				t.Fatalf("expected status %d, got %d message=%q", tt.wantStatus, status, message)
			}
			if tt.wantContainer == "" {
				if got != nil {
					t.Fatalf("expected no container, got %#v", got)
				}
				return
			}
			if got == nil || got.ID != tt.wantContainer {
				t.Fatalf("expected container %q, got %#v", tt.wantContainer, got)
			}
		})
	}
}

func newTerminalTestHandler(t *testing.T) *Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-terminal-test.db"))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("unwrap test db: %v", err)
	}
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})
	return &Handler{db: database}
}
