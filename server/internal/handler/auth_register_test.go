package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestRegisterNormalizesAndValidatesAccountFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)

	payload := map[string]any{
		"username":    "  clean-user_01 ",
		"displayName": " 学生一 ",
		"password":    "secret123",
		"qqNumber":    " 123456 ",
	}
	w := performRegister(payload, h.Register)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", w.Code, w.Body.String())
	}

	var saved model.User
	mustCreate(t, h.db.Where("username = ?", "clean-user_01").Take(&saved).Error)
	if saved.DisplayName != "学生一" {
		t.Fatalf("expected trimmed display name, got %q", saved.DisplayName)
	}
	if saved.QQNumber == nil || *saved.QQNumber != "123456" {
		t.Fatalf("expected trimmed qq number, got %#v", saved.QQNumber)
	}

	cases := []struct {
		name    string
		payload map[string]any
	}{
		{
			name: "script username",
			payload: map[string]any{
				"username":    "<script>",
				"displayName": "学生二",
				"password":    "secret123",
			},
		},
		{
			name: "html display name",
			payload: map[string]any{
				"username":    "student-two",
				"displayName": "<b>学生</b>",
				"password":    "secret123",
			},
		},
		{
			name: "invalid qq",
			payload: map[string]any{
				"username":    "student-three",
				"displayName": "学生三",
				"password":    "secret123",
				"qqNumber":    "12ab34",
			},
		},
		{
			name: "oversized password",
			payload: map[string]any{
				"username":    "student-four",
				"displayName": "学生四",
				"password":    strings.Repeat("a", 73),
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := performRegister(tc.payload, h.Register)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
			}
		})
	}
}

func TestUpdateProfileValidatesAccountFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	mustCreate(t, h.db.Create(&model.User{ID: "profile-user", Username: "profile-user", DisplayName: "Profile User", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)

	w := performProfileUpdate("profile-user", map[string]any{
		"username":    " renamed-user ",
		"displayName": " 新姓名 ",
		"qqNumber":    " ",
	}, h.UpdateProfile)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var saved model.User
	mustCreate(t, h.db.Where("id = ?", "profile-user").Take(&saved).Error)
	if saved.Username != "renamed-user" || saved.DisplayName != "新姓名" || saved.QQNumber != nil {
		t.Fatalf("unexpected profile normalization: %#v", saved)
	}

	w = performProfileUpdate("profile-user", map[string]any{
		"username": "<bad>",
	}, h.UpdateProfile)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid username 400, got %d body=%s", w.Code, w.Body.String())
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

func performProfileUpdate(userID string, payload map[string]any, call func(*gin.Context)) *httptest.ResponseRecorder {
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPut, "/auth/profile", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("userId", userID)
	call(c)
	return w
}
