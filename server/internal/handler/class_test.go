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

func TestTeacherCreateGroupAssignsCreatorAsAdvisor(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	seedTeacherUser(t, h, "teacher-create", "Teacher Create")

	w := performTeacherGroupCreate("teacher-create", map[string]any{"name": "Created Group"}, h.TeacherCreateGroup)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var saved model.Class
	mustCreate(t, h.db.Where("name = ?", "Created Group").Take(&saved).Error)
	if saved.CreatorTeacherID == nil || *saved.CreatorTeacherID != "teacher-create" {
		t.Fatalf("expected creator teacher-create, got %#v", saved.CreatorTeacherID)
	}
	if saved.HomeroomTeacherID == nil || *saved.HomeroomTeacherID != "teacher-create" {
		t.Fatalf("expected advisor teacher-create, got %#v", saved.HomeroomTeacherID)
	}
}

func TestTeacherUpdateGroupRejectsForeignRenameAndClaim(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	seedTeacherUser(t, h, "teacher-owner", "Teacher Owner")
	seedTeacherUser(t, h, "teacher-foreign", "Teacher Foreign")
	owner := "teacher-owner"
	now := model.Now()
	mustCreate(t, h.db.Create(&model.Class{
		ID:               "foreign-group",
		Name:             "Foreign Group",
		CreatorTeacherID: &owner,
		CreatedAt:        now,
		UpdatedAt:        now,
	}).Error)

	rename := performTeacherGroupUpdate("teacher-foreign", "foreign-group", map[string]any{"name": "Renamed"}, h.TeacherUpdateGroup)
	if rename.Code != http.StatusForbidden {
		t.Fatalf("expected rename 403, got %d body=%s", rename.Code, rename.Body.String())
	}

	claim := performTeacherGroupUpdate("teacher-foreign", "foreign-group", map[string]any{"claimAdvisor": true}, h.TeacherUpdateGroup)
	if claim.Code != http.StatusForbidden {
		t.Fatalf("expected claim 403, got %d body=%s", claim.Code, claim.Body.String())
	}

	var saved model.Class
	mustCreate(t, h.db.Where("id = ?", "foreign-group").Take(&saved).Error)
	if saved.Name != "Foreign Group" {
		t.Fatalf("expected name unchanged, got %s", saved.Name)
	}
	if saved.HomeroomTeacherID != nil {
		t.Fatalf("expected advisor unchanged nil, got %#v", saved.HomeroomTeacherID)
	}
}

func TestTeacherUpdateGroupRejectsTakingAssignedGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	seedTeacherUser(t, h, "teacher-owner-2", "Teacher Owner")
	seedTeacherUser(t, h, "teacher-foreign-2", "Teacher Foreign")
	owner := "teacher-owner-2"
	now := model.Now()
	mustCreate(t, h.db.Create(&model.Class{
		ID:                "assigned-group",
		Name:              "Assigned Group",
		HomeroomTeacherID: &owner,
		CreatorTeacherID:  &owner,
		CreatedAt:         now,
		UpdatedAt:         now,
	}).Error)

	claim := performTeacherGroupUpdate("teacher-foreign-2", "assigned-group", map[string]any{"claimAdvisor": true}, h.TeacherUpdateGroup)
	if claim.Code != http.StatusConflict {
		t.Fatalf("expected claim 409, got %d body=%s", claim.Code, claim.Body.String())
	}

	var saved model.Class
	mustCreate(t, h.db.Where("id = ?", "assigned-group").Take(&saved).Error)
	if saved.HomeroomTeacherID == nil || *saved.HomeroomTeacherID != owner {
		t.Fatalf("expected owner advisor unchanged, got %#v", saved.HomeroomTeacherID)
	}
}

func TestTeacherUpdateGroupAllowsCreatorToClaimOwnUnassignedGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	seedTeacherUser(t, h, "teacher-reclaim", "Teacher Reclaim")
	creator := "teacher-reclaim"
	now := model.Now()
	mustCreate(t, h.db.Create(&model.Class{
		ID:               "creator-unassigned-group",
		Name:             "Creator Group",
		CreatorTeacherID: &creator,
		CreatedAt:        now,
		UpdatedAt:        now,
	}).Error)

	claim := performTeacherGroupUpdate("teacher-reclaim", "creator-unassigned-group", map[string]any{"claimAdvisor": true}, h.TeacherUpdateGroup)
	if claim.Code != http.StatusOK {
		t.Fatalf("expected claim 200, got %d body=%s", claim.Code, claim.Body.String())
	}

	var saved model.Class
	mustCreate(t, h.db.Where("id = ?", "creator-unassigned-group").Take(&saved).Error)
	if saved.HomeroomTeacherID == nil || *saved.HomeroomTeacherID != creator {
		t.Fatalf("expected creator to become advisor, got %#v", saved.HomeroomTeacherID)
	}
}

func seedTeacherUser(t *testing.T, h *Handler, id, displayName string) {
	t.Helper()
	now := model.Now()
	mustCreate(t, h.db.Create(&model.User{
		ID:           id,
		Username:     id,
		DisplayName:  displayName,
		Role:         "TEACHER",
		CreatedAt:    now,
		UpdatedAt:    now,
		LastActiveAt: now,
	}).Error)
}

func performTeacherGroupCreate(userID string, payload map[string]any, call func(*gin.Context)) *httptest.ResponseRecorder {
	return performTeacherGroupRequest(http.MethodPost, "/teacher/groups", userID, "", payload, call)
}

func performTeacherGroupUpdate(userID, groupID string, payload map[string]any, call func(*gin.Context)) *httptest.ResponseRecorder {
	return performTeacherGroupRequest(http.MethodPatch, "/teacher/groups/"+groupID, userID, groupID, payload, call)
}

func performTeacherGroupRequest(method, path, userID, groupID string, payload map[string]any, call func(*gin.Context)) *httptest.ResponseRecorder {
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("userId", userID)
	c.Set("role", "TEACHER")
	if groupID != "" {
		c.Params = gin.Params{{Key: "id", Value: groupID}}
	}
	call(c)
	return w
}
