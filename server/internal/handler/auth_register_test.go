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

func TestRegisterRejectsPublicTeacherRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)

	payload := map[string]any{
		"username":    "public-teacher",
		"displayName": "Public Teacher",
		"password":    "secret123",
		"role":        "TEACHER",
	}
	w := performRegister(payload, h.Register)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}

	var count int64
	h.db.Model(&model.User{}).Where("username = ?", "public-teacher").Count(&count)
	if count != 0 {
		t.Fatalf("expected no public teacher account to be created, got %d", count)
	}
}

func TestRegisterDefaultsToStudentRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)

	payload := map[string]any{
		"username":    "public-student",
		"displayName": "Public Student",
		"password":    "secret123",
	}
	w := performRegister(payload, h.Register)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", w.Code, w.Body.String())
	}

	var saved model.User
	mustCreate(t, h.db.Where("username = ?", "public-student").Take(&saved).Error)
	if saved.Role != "STUDENT" {
		t.Fatalf("expected STUDENT role, got %s", saved.Role)
	}
}

func performRegister(payload map[string]any, call func(*gin.Context)) *httptest.ResponseRecorder {
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	call(c)
	return w
}
