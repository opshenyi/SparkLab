package handler

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sparklab/server/internal/db"
	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestAdminForceStopContainerStopsDockerBeforeUpdatingRecord(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAdminContainerTestHandler(t)
	now := time.Now()
	serverID := "local-docker"
	var stopCalled int32

	dockerAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/containers/docker-running/stop" || r.URL.Query().Get("t") != "5" {
			t.Fatalf("unexpected docker request: %s %s", r.Method, r.URL.String())
		}
		atomic.AddInt32(&stopCalled, 1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer dockerAPI.Close()

	h.dockerHTTP = dockerAPI.Client()
	h.dockerAPIBaseURL = dockerAPI.URL

	mustCreate(t, h.db.Create(&model.User{ID: "admin-container-user", Username: "admin-container-user", DisplayName: "Student", Role: "STUDENT", CreatedAt: model.Now(), UpdatedAt: model.Now(), LastActiveAt: model.Now()}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "admin-container-course", Title: "Course", IsActive: true, CreatedAt: model.Now(), UpdatedAt: model.Now()}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "admin-container-lab", CourseID: "admin-container-course", Type: "lab", Title: "Lab", CreatedAt: model.Now(), UpdatedAt: model.Now()}).Error)
	mustCreate(t, h.db.Create(&model.Container{
		ID:           "admin-container-running",
		UserID:       "admin-container-user",
		LabID:        "admin-container-lab",
		ServerID:     &serverID,
		ContainerID:  "docker-running",
		Status:       "running",
		CreatedAt:    now,
		LastActiveAt: now,
		AutoStopAt:   ptrTime(now.Add(time.Hour)),
	}).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/admin/containers/admin-container-running/force-stop", nil)
	c.Params = gin.Params{{Key: "id", Value: "admin-container-running"}}

	h.AdminForceStopContainer(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	if atomic.LoadInt32(&stopCalled) != 1 {
		t.Fatalf("expected Docker stop request to be called once")
	}

	var saved model.Container
	mustCreate(t, h.db.Where("id = ?", "admin-container-running").Take(&saved).Error)
	if saved.Status != "stopped" || saved.StoppedAt == nil || saved.AutoStopAt != nil {
		t.Fatalf("expected stopped record with no auto stop, got status=%s stoppedAt=%#v autoStopAt=%#v", saved.Status, saved.StoppedAt, saved.AutoStopAt)
	}
}

func TestAdminForceStopContainerDoesNotMaskDockerFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAdminContainerTestHandler(t)
	now := time.Now()
	serverID := "local-docker"

	dockerAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("docker unavailable"))
	}))
	defer dockerAPI.Close()

	h.dockerHTTP = dockerAPI.Client()
	h.dockerAPIBaseURL = dockerAPI.URL

	mustCreate(t, h.db.Create(&model.User{ID: "admin-container-user-2", Username: "admin-container-user-2", DisplayName: "Student", Role: "STUDENT", CreatedAt: model.Now(), UpdatedAt: model.Now(), LastActiveAt: model.Now()}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "admin-container-course-2", Title: "Course", IsActive: true, CreatedAt: model.Now(), UpdatedAt: model.Now()}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "admin-container-lab-2", CourseID: "admin-container-course-2", Type: "lab", Title: "Lab", CreatedAt: model.Now(), UpdatedAt: model.Now()}).Error)
	mustCreate(t, h.db.Create(&model.Container{
		ID:           "admin-container-failing",
		UserID:       "admin-container-user-2",
		LabID:        "admin-container-lab-2",
		ServerID:     &serverID,
		ContainerID:  "docker-failing",
		Status:       "running",
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/admin/containers/admin-container-failing/force-stop", nil)
	c.Params = gin.Params{{Key: "id", Value: "admin-container-failing"}}

	h.AdminForceStopContainer(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "docker unavailable") {
		t.Fatalf("expected Docker error in response, got %s", w.Body.String())
	}

	var saved model.Container
	mustCreate(t, h.db.Where("id = ?", "admin-container-failing").Take(&saved).Error)
	if saved.Status != "running" {
		t.Fatalf("expected record to remain running after Docker failure, got %s", saved.Status)
	}
}

func newAdminContainerTestHandler(t *testing.T) *Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-admin-container-test.db"))
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

func ptrTime(v time.Time) *time.Time {
	return &v
}
