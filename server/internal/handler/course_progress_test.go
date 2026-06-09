package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"sparklab/server/internal/db"
	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestRefreshCourseProgressCountsPassedSubmissionsAndCompletedVideos(t *testing.T) {
	h := newCourseProgressTestHandler(t)
	now := model.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "student-progress", Username: "student-progress", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "course-progress", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "lab-progress", CourseID: "course-progress", Type: "lab", Title: "Lab", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "exam-progress", CourseID: "course-progress", Type: "exam", Title: "Exam", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "video-progress", CourseID: "course-progress", Type: "video", Title: "Video", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.CourseMaterial{ID: "material-progress", CourseID: "course-progress", Title: "Material", OriginalName: "guide.pdf", StoredPath: "guide.pdf", MimeType: "application/pdf", FileKind: "pdf", CreatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Submission{ID: "sub-progress-passed", UserID: "student-progress", LabID: "lab-progress", Score: 10, MaxScore: 10, Status: "passed", SubmittedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Submission{ID: "sub-progress-failed", UserID: "student-progress", LabID: "exam-progress", Score: 0, MaxScore: 10, Status: "failed", SubmittedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.VideoProgress{ID: "vp-progress", UserID: "student-progress", LabID: "video-progress", WatchedDuration: 90, TotalDuration: 100, Completed: true, LastWatchedAt: time.Now(), CreatedAt: time.Now(), UpdatedAt: time.Now()}).Error)
	mustCreate(t, h.db.Create(&model.MaterialProgress{ID: "mp-progress", UserID: "student-progress", MaterialID: "material-progress", Completed: true, CompletedAt: time.Now(), CreatedAt: time.Now(), UpdatedAt: time.Now()}).Error)

	progress, err := h.refreshCourseProgressForUser("student-progress", "course-progress")
	if err != nil {
		t.Fatalf("refresh progress: %v", err)
	}
	if progress != 75 {
		t.Fatalf("expected progress 75, got %d", progress)
	}

	var enrollment model.Enrollment
	mustCreate(t, h.db.Where("userId = ? AND courseId = ?", "student-progress", "course-progress").Take(&enrollment).Error)
	if enrollment.Progress != 75 || enrollment.CompletedAt != nil {
		t.Fatalf("unexpected partial enrollment: progress=%d completedAt=%#v", enrollment.Progress, enrollment.CompletedAt)
	}

	mustCreate(t, h.db.Model(&model.Submission{}).Where("id = ?", "sub-progress-failed").Updates(map[string]any{"status": "passed", "score": 8}).Error)
	progress, err = h.refreshCourseProgressForUser("student-progress", "course-progress")
	if err != nil {
		t.Fatalf("refresh completed progress: %v", err)
	}
	if progress != 100 {
		t.Fatalf("expected progress 100, got %d", progress)
	}
	mustCreate(t, h.db.Where("userId = ? AND courseId = ?", "student-progress", "course-progress").Take(&enrollment).Error)
	if enrollment.Progress != 100 || enrollment.CompletedAt == nil {
		t.Fatalf("unexpected completed enrollment: progress=%d completedAt=%#v", enrollment.Progress, enrollment.CompletedAt)
	}
}

func TestCompleteCourseMaterialCreatesProgressAndEnrollment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "student-material", Username: "student-material", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.User{ID: "teacher-material", Username: "teacher-material", DisplayName: "Teacher", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "course-material", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.CourseMaterial{ID: "material-complete", CourseID: "course-material", Title: "Guide", OriginalName: "guide.pdf", StoredPath: "guide.pdf", MimeType: "application/pdf", FileKind: "pdf", CreatedAt: now}).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/course-materials/material-complete/complete", bytes.NewReader([]byte(`{}`)))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: "material-complete"}}
	c.Set("userId", "student-material")
	c.Set("role", "STUDENT")

	h.CompleteCourseMaterial(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var enrollment model.Enrollment
	mustCreate(t, h.db.Where("userId = ? AND courseId = ?", "student-material", "course-material").Take(&enrollment).Error)
	if enrollment.Progress != 100 || enrollment.CompletedAt == nil {
		t.Fatalf("expected material completion to finish course, got progress=%d completedAt=%#v", enrollment.Progress, enrollment.CompletedAt)
	}
	var progress model.MaterialProgress
	mustCreate(t, h.db.Where("userId = ? AND materialId = ?", "student-material", "material-complete").Take(&progress).Error)
	if !progress.Completed {
		t.Fatalf("expected material progress completed")
	}

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/course-materials/material-complete/complete", bytes.NewReader([]byte(`{}`)))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: "material-complete"}}
	c.Set("userId", "teacher-material")
	c.Set("role", "TEACHER")
	h.CompleteCourseMaterial(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected teacher completion rejected, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestCompleteVideoCreatesProgressAndEnrollment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "student-video", Username: "student-video", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "course-video", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "video-complete", CourseID: "course-video", Type: "video", Title: "Video", Points: 10, VideoDuration: 100, CreatedAt: now, UpdatedAt: now}).Error)

	body, _ := json.Marshal(gin.H{"watchedDuration": 95, "totalDuration": 100, "progress": 95})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/labs/video-complete/complete-video", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: "video-complete"}}
	c.Set("userId", "student-video")
	c.Set("role", "STUDENT")

	h.CompleteVideo(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var enrollment model.Enrollment
	mustCreate(t, h.db.Where("userId = ? AND courseId = ?", "student-video", "course-video").Take(&enrollment).Error)
	if enrollment.Progress != 100 || enrollment.CompletedAt == nil {
		t.Fatalf("expected completed enrollment, got progress=%d completedAt=%#v", enrollment.Progress, enrollment.CompletedAt)
	}
	var vp model.VideoProgress
	mustCreate(t, h.db.Where("userId = ? AND labId = ?", "student-video", "video-complete").Take(&vp).Error)
	if !vp.Completed || vp.WatchedDuration != 95 || vp.TotalDuration != 100 {
		t.Fatalf("unexpected video progress: %#v", vp)
	}
}

func newCourseProgressTestHandler(t *testing.T) *Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-course-progress-test.db"))
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
