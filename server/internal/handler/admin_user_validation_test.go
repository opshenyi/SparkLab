package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestAdminCreateUserNormalizesAndValidatesAccountFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)

	w := performAdminUserRequest(http.MethodPost, "/admin/users", "", map[string]any{
		"username":    " teacher-01 ",
		"displayName": " 张老师 ",
		"password":    "secret123",
		"role":        "teacher",
		"qqNumber":    " 1234567 ",
	}, "ADMIN", h.AdminCreateUser)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var saved model.User
	mustCreate(t, h.db.Where("username = ?", "teacher-01").Take(&saved).Error)
	if saved.Role != "TEACHER" || saved.DisplayName != "张老师" || saved.QQNumber == nil || *saved.QQNumber != "1234567" {
		t.Fatalf("unexpected created user normalization: %#v", saved)
	}

	w = performAdminUserRequest(http.MethodPost, "/admin/users", "", map[string]any{
		"username":    "bad/user",
		"displayName": "学生",
		"password":    "secret123",
	}, "ADMIN", h.AdminCreateUser)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid username 400, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestAdminUpdateUserValidatesAccountFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	mustCreate(t, h.db.Create(&model.User{ID: "admin-update-user", Username: "admin-update-user", DisplayName: "User", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)

	w := performAdminUserRequest(http.MethodPut, "/admin/users/admin-update-user", "admin-update-user", map[string]any{
		"username":    " updated-user ",
		"displayName": " 更新学生 ",
		"qqNumber":    " ",
	}, "ADMIN", h.AdminUpdateUser)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var saved model.User
	mustCreate(t, h.db.Where("id = ?", "admin-update-user").Take(&saved).Error)
	if saved.Username != "updated-user" || saved.DisplayName != "更新学生" || saved.QQNumber != nil {
		t.Fatalf("unexpected updated user normalization: %#v", saved)
	}

	w = performAdminUserRequest(http.MethodPut, "/admin/users/admin-update-user", "admin-update-user", map[string]any{
		"displayName": "<bad>",
	}, "ADMIN", h.AdminUpdateUser)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid display name 400, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestAdminCreateUserWritesAuditLogAndStatsReturnsIt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	mustCreate(t, h.db.Create(&model.User{ID: "audit-admin", Username: "audit-admin", DisplayName: "Audit Admin", Role: "ADMIN", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)

	w := performAdminUserRequest(http.MethodPost, "/admin/users", "", map[string]any{
		"username":    "audit-student",
		"displayName": "审计学生",
		"password":    "secret123",
	}, "ADMIN", h.AdminCreateUser)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var log model.ActivityLog
	mustCreate(t, h.db.Where("userId = ? AND action = ?", "audit-admin", "admin_create_user").Take(&log).Error)
	if log.TargetType == nil || *log.TargetType != "user" || log.TargetName == nil || *log.TargetName != "审计学生" {
		t.Fatalf("unexpected audit log: %#v", log)
	}

	w = httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/admin/stats", nil)
	h.AdminStats(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected stats 200, got %d body=%s", w.Code, w.Body.String())
	}

	var body struct {
		RecentAuditLogs []struct {
			Action string `json:"action"`
			Actor  struct {
				ID string `json:"id"`
			} `json:"actor"`
			TargetName string `json:"targetName"`
		} `json:"recentAuditLogs"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode stats: %v", err)
	}
	if len(body.RecentAuditLogs) != 1 || body.RecentAuditLogs[0].Action != "admin_create_user" ||
		body.RecentAuditLogs[0].Actor.ID != "audit-admin" || body.RecentAuditLogs[0].TargetName != "审计学生" {
		t.Fatalf("unexpected audit stats: %#v", body.RecentAuditLogs)
	}
}

func performAdminUserRequest(method, path, id string, payload map[string]any, role string, call func(*gin.Context)) *httptest.ResponseRecorder {
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("role", role)
	c.Set("userId", "audit-admin")
	if id != "" {
		c.Params = gin.Params{{Key: "id", Value: id}}
	}
	call(c)
	return w
}
