package router

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"sparklab/server/internal/auth"
	"sparklab/server/internal/config"
	"sparklab/server/internal/db"
	"sparklab/server/internal/model"
)

func TestClassesRouteRequiresAdminRole(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-router-classes-test.db"))
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

	now := model.Now()
	mustCreateRouterRecord(t, database.Create(&model.User{ID: "router-admin", Username: "router-admin", DisplayName: "Admin", Role: "ADMIN", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreateRouterRecord(t, database.Create(&model.User{ID: "router-student", Username: "router-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreateRouterRecord(t, database.Create(&model.Class{ID: "router-class", Name: "Private Group", CreatedAt: now, UpdatedAt: now}).Error)

	cfg := &config.Config{JWTSecret: "router-classes-secret", JWTExpires: "1h", WebURL: "http://localhost:3000", DockerHost: "unix:///var/run/docker.sock"}
	r := New(cfg, database)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/classes", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected anonymous 401, got %d body=%s", w.Code, w.Body.String())
	}

	studentToken := signRouterToken(t, cfg.JWTSecret, "router-student", "router-student", "STUDENT")
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/classes", nil)
	req.Header.Set("Authorization", "Bearer "+studentToken)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected student 403, got %d body=%s", w.Code, w.Body.String())
	}

	adminToken := signRouterToken(t, cfg.JWTSecret, "router-admin", "router-admin", "ADMIN")
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/classes", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected admin 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func signRouterToken(t *testing.T, secret, userID, username, role string) string {
	t.Helper()
	token, err := auth.SignToken(secret, userID, username, role, "1h")
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func mustCreateRouterRecord(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
