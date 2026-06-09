package handler

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestCreateContainerReusesActiveLabContainer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	containerNow := time.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "quota-student", Username: "quota-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "quota-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Enrollment{ID: "quota-enrollment", UserID: "quota-student", CourseID: "quota-course", StartedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "quota-lab", CourseID: "quota-course", Type: "lab", Title: "Lab", CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Container{ID: "quota-existing", UserID: "quota-student", LabID: "quota-lab", ContainerID: "docker-existing", Status: "running", CreatedAt: containerNow, LastActiveAt: containerNow}).Error)

	w := trainingRequest(http.MethodPost, "/containers", gin.H{"labId": "quota-lab"}, "quota-student", "STUDENT", nil, h.CreateContainer)
	if w.Code != http.StatusOK {
		t.Fatalf("expected existing container 200, got %d body=%s", w.Code, w.Body.String())
	}
	var body model.Container
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.ID != "quota-existing" || body.ContainerID != "docker-existing" {
		t.Fatalf("expected existing container, got %#v", body)
	}
	assertModelCount(t, h, &model.Container{}, "userId = ? AND labId = ?", []any{"quota-student", "quota-lab"}, 1)
}

func TestCreateContainerRejectsNewLabWhenUserQuotaReached(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("MAX_CONTAINERS_PER_USER", "1")
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	containerNow := time.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "quota-limit-student", Username: "quota-limit-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "quota-limit-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Enrollment{ID: "quota-limit-enrollment", UserID: "quota-limit-student", CourseID: "quota-limit-course", StartedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "quota-limit-lab-a", CourseID: "quota-limit-course", Type: "lab", Title: "Lab A", CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "quota-limit-lab-b", CourseID: "quota-limit-course", Type: "lab", Title: "Lab B", CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Container{ID: "quota-limit-existing", UserID: "quota-limit-student", LabID: "quota-limit-lab-a", ContainerID: "docker-existing", Status: "running", CreatedAt: containerNow, LastActiveAt: containerNow}).Error)

	w := trainingRequest(http.MethodPost, "/containers", gin.H{"labId": "quota-limit-lab-b"}, "quota-limit-student", "STUDENT", nil, h.CreateContainer)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected quota 400, got %d body=%s", w.Code, w.Body.String())
	}
	assertModelCount(t, h, &model.Container{}, "userId = ?", []any{"quota-limit-student"}, 1)
}
