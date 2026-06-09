package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"sparklab/server/internal/db"
	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestGradeSubmissionUpdatesAnswerScoreAndFeedback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-grade-test.db"))
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
	h := &Handler{db: database}

	now := model.Now()
	teacherID := "teacher-grade"
	studentID := "student-grade"
	groupID := "group-grade"
	courseID := "course-grade"
	labID := "lab-grade"
	questionID := "question-grade"
	submissionID := "submission-grade"

	mustCreate(t, database.Create(&model.User{ID: teacherID, Username: "teacher", DisplayName: "Teacher", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: studentID, Username: "student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.Class{ID: groupID, Name: "Group", HomeroomTeacherID: strPtr(teacherID), CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.GroupMembership{ID: "gm-grade", UserID: studentID, ClassID: groupID, CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Course{ID: courseID, Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.CourseClassLink{ID: "link-grade", CourseID: courseID, ClassID: groupID, CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Lab{ID: labID, CourseID: courseID, Type: "exam", Title: "Exam", Points: 5, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Question{ID: questionID, LabID: labID, Type: "essay", Title: "Essay", Content: "Explain", Answer: `""`, Points: 5, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: submissionID, UserID: studentID, LabID: labID, Score: 0, MaxScore: 5, Status: "failed", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Answer{ID: "answer-grade", UserID: studentID, QuestionID: questionID, SubmissionID: submissionID, Answer: `"draft"`, Score: 0, IsCorrect: false, CreatedAt: now}).Error)

	body, _ := json.Marshal(gin.H{
		"feedback": "思路正确，补充关键命令说明。",
		"answers":  []gin.H{{"questionId": questionID, "score": 4}},
	})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPatch, "/submissions/"+submissionID+"/grade", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "submissionId", Value: submissionID}}
	c.Set("userId", teacherID)
	c.Set("role", "TEACHER")

	h.GradeSubmission(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var saved model.Submission
	mustCreate(t, database.Where("id = ?", submissionID).Take(&saved).Error)
	if saved.Score != 4 || saved.Status != "passed" {
		t.Fatalf("expected submission score/status updated, got %d/%s", saved.Score, saved.Status)
	}
	if saved.Feedback == nil || *saved.Feedback != "思路正确，补充关键命令说明。" {
		t.Fatalf("expected feedback saved, got %#v", saved.Feedback)
	}
	var answer model.Answer
	mustCreate(t, database.Where("questionId = ?", questionID).Take(&answer).Error)
	if answer.Score != 4 || answer.IsCorrect {
		t.Fatalf("expected partial answer score without full correctness, got score=%d correct=%v", answer.Score, answer.IsCorrect)
	}
}

func mustCreate(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
