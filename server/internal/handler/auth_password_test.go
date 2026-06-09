package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sparklab/server/internal/config"
	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func TestForcedAdminPasswordChangeFlow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	h.cfg = &config.Config{JWTSecret: "test-secret", JWTExpires: "7d"}
	h.authLimiter = newAuthAttemptLimiterFromEnv()
	now := model.Now()

	hashed, err := bcrypt.GenerateFromPassword([]byte("admin123"), 10)
	if err != nil {
		t.Fatalf("hash default password: %v", err)
	}
	mustCreate(t, h.db.Create(&model.User{
		ID:                 "forced-admin",
		Username:           "admin",
		DisplayName:        "Admin",
		Email:              "admin@sparklab.local",
		Password:           string(hashed),
		Role:               "ADMIN",
		MustChangePassword: true,
		CreatedAt:          now,
		UpdatedAt:          now,
		LastActiveAt:       now,
	}).Error)

	login := performAuthJSON("forced-admin", "ADMIN", map[string]any{
		"username": "admin",
		"password": "admin123",
	}, h.Login)
	if login.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d body=%s", login.Code, login.Body.String())
	}
	var loginPayload struct {
		User struct {
			MustChangePassword bool `json:"mustChangePassword"`
		} `json:"user"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	if !loginPayload.User.MustChangePassword {
		t.Fatal("expected login response to require password change")
	}

	adminGate := performRequireAdmin(h, "forced-admin", "ADMIN")
	if adminGate.Code != http.StatusPreconditionRequired {
		t.Fatalf("expected admin gate 428 before password change, got %d body=%s", adminGate.Code, adminGate.Body.String())
	}

	defaultPassword := performAuthJSON("forced-admin", "ADMIN", map[string]any{
		"currentPassword": "admin123",
		"newPassword":     "admin123",
	}, h.UpdatePassword)
	if defaultPassword.Code != http.StatusBadRequest {
		t.Fatalf("expected default password reuse 400, got %d body=%s", defaultPassword.Code, defaultPassword.Body.String())
	}

	changed := performAuthJSON("forced-admin", "ADMIN", map[string]any{
		"currentPassword": "admin123",
		"newPassword":     "new-admin-123",
	}, h.UpdatePassword)
	if changed.Code != http.StatusOK {
		t.Fatalf("expected password change 200, got %d body=%s", changed.Code, changed.Body.String())
	}

	var saved model.User
	mustCreate(t, h.db.Where("id = ?", "forced-admin").Take(&saved).Error)
	if saved.MustChangePassword {
		t.Fatal("expected mustChangePassword to be cleared")
	}
	if bcrypt.CompareHashAndPassword([]byte(saved.Password), []byte("new-admin-123")) != nil {
		t.Fatal("expected saved password to match new password")
	}

	adminGate = performRequireAdmin(h, "forced-admin", "ADMIN")
	if adminGate.Code != http.StatusOK {
		t.Fatalf("expected admin gate 200 after password change, got %d body=%s", adminGate.Code, adminGate.Body.String())
	}
}

func performAuthJSON(userID, role string, payload map[string]any, call func(*gin.Context)) *httptest.ResponseRecorder {
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	if userID != "" {
		c.Set("userId", userID)
	}
	if role != "" {
		c.Set("role", role)
	}
	call(c)
	return w
}

func performRequireAdmin(h *Handler, userID, role string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/admin", nil)
	c.Set("userId", userID)
	c.Set("role", role)
	h.RequireAdmin()(c)
	if !c.IsAborted() {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
	return w
}
