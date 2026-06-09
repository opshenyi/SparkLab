package handler

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sparklab/server/internal/config"
	"sparklab/server/internal/db"
	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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

func TestServerContainerActionsRejectUnmanagedDockerContainers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAdminContainerTestHandler(t)
	var dockerCalls int32
	dockerAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&dockerCalls, 1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer dockerAPI.Close()
	h.dockerHTTP = dockerAPI.Client()
	h.dockerAPIBaseURL = dockerAPI.URL

	actions := []struct {
		name   string
		method string
		path   string
		call   func(*gin.Context)
	}{
		{name: "start", method: http.MethodPost, path: "/servers/local-docker/containers/host-nginx/start", call: h.StartServerContainer},
		{name: "stop", method: http.MethodPost, path: "/servers/local-docker/containers/host-nginx/stop", call: h.StopServerContainer},
		{name: "remove", method: http.MethodDelete, path: "/servers/local-docker/containers/host-nginx", call: h.RemoveServerContainer},
	}

	for _, action := range actions {
		t.Run(action.name, func(t *testing.T) {
			w := performServerContainerAction(action.method, action.path, "local-docker", "host-nginx", action.call)
			if w.Code != http.StatusNotFound {
				t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
			}
		})
	}

	if atomic.LoadInt32(&dockerCalls) != 0 {
		t.Fatalf("expected Docker API not to be called for unmanaged containers")
	}
}

func TestServerContainerActionsRejectCrossServerContainers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAdminContainerTestHandler(t)
	seedAdminContainerGraph(t, h, "cross-server")
	otherServer := "other-docker"
	now := time.Now()
	mustCreate(t, h.db.Create(&model.Container{
		ID:           "cross-server-container",
		UserID:       "cross-server-user",
		LabID:        "cross-server-lab",
		ServerID:     &otherServer,
		ContainerID:  "docker-cross-server",
		Status:       "running",
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error)

	var dockerCalls int32
	dockerAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&dockerCalls, 1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer dockerAPI.Close()
	h.dockerHTTP = dockerAPI.Client()
	h.dockerAPIBaseURL = dockerAPI.URL

	w := performServerContainerAction(http.MethodPost, "/servers/local-docker/containers/docker-cross-server/stop", "local-docker", "docker-cross-server", h.StopServerContainer)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", w.Code, w.Body.String())
	}
	if atomic.LoadInt32(&dockerCalls) != 0 {
		t.Fatalf("expected Docker API not to be called for cross-server containers")
	}
}

func TestServerContainerActionsOperateManagedContainers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAdminContainerTestHandler(t)
	seedAdminContainerGraph(t, h, "managed-actions")
	serverID := "local-docker"
	now := time.Now()
	records := []model.Container{
		{
			ID:           "managed-actions-start",
			UserID:       "managed-actions-user",
			LabID:        "managed-actions-lab",
			ServerID:     &serverID,
			ContainerID:  "docker-start",
			Status:       "stopped",
			CreatedAt:    now,
			LastActiveAt: now,
		},
		{
			ID:           "managed-actions-stop",
			UserID:       "managed-actions-user",
			LabID:        "managed-actions-lab",
			ServerID:     &serverID,
			ContainerID:  "docker-stop",
			Status:       "running",
			CreatedAt:    now,
			LastActiveAt: now,
			AutoStopAt:   ptrTime(now.Add(time.Hour)),
		},
		{
			ID:           "managed-actions-remove",
			UserID:       "managed-actions-user",
			LabID:        "managed-actions-lab",
			ServerID:     &serverID,
			ContainerID:  "docker-remove",
			Status:       "stopped",
			CreatedAt:    now,
			LastActiveAt: now,
		},
	}
	for _, record := range records {
		mustCreate(t, h.db.Create(&record).Error)
	}

	var seen atomic.Int32
	dockerAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/containers/docker-start/start":
		case r.Method == http.MethodPost && r.URL.Path == "/containers/docker-stop/stop" && r.URL.Query().Get("t") == "5":
		case r.Method == http.MethodDelete && r.URL.Path == "/containers/docker-remove" && r.URL.RawQuery == "force=1":
		default:
			t.Fatalf("unexpected docker request: %s %s", r.Method, r.URL.String())
		}
		seen.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer dockerAPI.Close()
	h.dockerHTTP = dockerAPI.Client()
	h.dockerAPIBaseURL = dockerAPI.URL

	start := performServerContainerAction(http.MethodPost, "/servers/local-docker/containers/docker-start/start", serverID, "docker-start", h.StartServerContainer)
	if start.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d body=%s", start.Code, start.Body.String())
	}
	stop := performServerContainerAction(http.MethodPost, "/servers/local-docker/containers/docker-stop/stop", serverID, "docker-stop", h.StopServerContainer)
	if stop.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d body=%s", stop.Code, stop.Body.String())
	}
	remove := performServerContainerAction(http.MethodDelete, "/servers/local-docker/containers/docker-remove", serverID, "docker-remove", h.RemoveServerContainer)
	if remove.Code != http.StatusOK {
		t.Fatalf("expected remove 200, got %d body=%s", remove.Code, remove.Body.String())
	}
	if seen.Load() != 3 {
		t.Fatalf("expected three Docker calls, got %d", seen.Load())
	}

	var started model.Container
	mustCreate(t, h.db.Where("id = ?", "managed-actions-start").Take(&started).Error)
	if started.Status != "running" || started.AutoStopAt == nil || started.StoppedAt != nil {
		t.Fatalf("expected started record to be running with auto stop, got status=%s autoStopAt=%#v stoppedAt=%#v", started.Status, started.AutoStopAt, started.StoppedAt)
	}

	var stopped model.Container
	mustCreate(t, h.db.Where("id = ?", "managed-actions-stop").Take(&stopped).Error)
	if stopped.Status != "stopped" || stopped.StoppedAt == nil || stopped.AutoStopAt != nil {
		t.Fatalf("expected stopped record with no auto stop, got status=%s stoppedAt=%#v autoStopAt=%#v", stopped.Status, stopped.StoppedAt, stopped.AutoStopAt)
	}

	var removed model.Container
	err := h.db.Where("id = ?", "managed-actions-remove").Take(&removed).Error
	if !errorsIsRecordNotFound(err) {
		t.Fatalf("expected removed record to be deleted, got err=%v record=%#v", err, removed)
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
	api, baseURL := newPooledDockerHTTPClient("unix:///var/run/docker.sock")
	return &Handler{
		db:               database,
		cfg:              &config.Config{DockerHost: "unix:///var/run/docker.sock"},
		dockerHTTP:       api,
		dockerAPIBaseURL: baseURL,
	}
}

func ptrTime(v time.Time) *time.Time {
	return &v
}

func seedAdminContainerGraph(t *testing.T, h *Handler, prefix string) {
	t.Helper()
	now := model.Now()
	mustCreate(t, h.db.Create(&model.User{ID: prefix + "-user", Username: prefix + "-user", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: prefix + "-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: prefix + "-lab", CourseID: prefix + "-course", Type: "lab", Title: "Lab", CreatedAt: now, UpdatedAt: now}).Error)
}

func performServerContainerAction(method, path, serverID, containerID string, call func(*gin.Context)) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, nil)
	c.Params = gin.Params{
		{Key: "id", Value: serverID},
		{Key: "containerId", Value: containerID},
	}
	call(c)
	return w
}

func errorsIsRecordNotFound(err error) bool {
	return err != nil && errors.Is(err, gorm.ErrRecordNotFound)
}
