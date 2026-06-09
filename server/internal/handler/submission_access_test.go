package handler

import (
	"path/filepath"
	"testing"

	"sparklab/server/internal/db"
	"sparklab/server/internal/model"
)

func TestTeacherCanReviewOnlyOwnGroupCourseSubmissions(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-test.db"))
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

	teacherID := "teacher-1"
	otherTeacherID := "teacher-2"
	studentID := "student-1"
	otherStudentID := "student-2"
	groupID := "group-1"
	courseID := "course-1"
	publicCourseID := "course-public"

	now := model.Now()
	if err := database.Create(&model.User{ID: teacherID, Username: "teacher", DisplayName: "Teacher", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error; err != nil {
		t.Fatalf("create teacher: %v", err)
	}
	if err := database.Create(&model.User{ID: otherTeacherID, Username: "teacher2", DisplayName: "Teacher 2", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error; err != nil {
		t.Fatalf("create other teacher: %v", err)
	}
	if err := database.Create(&model.User{ID: studentID, Username: "student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error; err != nil {
		t.Fatalf("create student: %v", err)
	}
	if err := database.Create(&model.User{ID: otherStudentID, Username: "student2", DisplayName: "Student 2", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error; err != nil {
		t.Fatalf("create other student: %v", err)
	}
	if err := database.Create(&model.Class{ID: groupID, Name: "Group", HomeroomTeacherID: strPtr(teacherID), CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}
	if err := database.Create(&model.GroupMembership{ID: "gm-1", UserID: studentID, ClassID: groupID, CreatedAt: now}).Error; err != nil {
		t.Fatalf("create membership: %v", err)
	}
	if err := database.Create(&model.Course{ID: courseID, Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create course: %v", err)
	}
	if err := database.Create(&model.Course{ID: publicCourseID, Title: "Public", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create public course: %v", err)
	}
	if err := database.Create(&model.CourseClassLink{ID: "link-1", CourseID: courseID, ClassID: groupID, CreatedAt: now}).Error; err != nil {
		t.Fatalf("create course link: %v", err)
	}

	if !h.teacherCanReviewStudentSubmission(teacherID, studentID, courseID) {
		t.Fatal("teacher should review submissions for own group course and own group student")
	}
	if h.teacherCanReviewStudentSubmission(otherTeacherID, studentID, courseID) {
		t.Fatal("unassigned teacher must not review the submission")
	}
	if h.teacherCanReviewStudentSubmission(teacherID, otherStudentID, courseID) {
		t.Fatal("teacher must not review students outside the advised group")
	}
	if h.teacherCanReviewStudentSubmission(teacherID, studentID, publicCourseID) {
		t.Fatal("public course without assigned group must not grant teacher review access")
	}
}

func strPtr(v string) *string {
	return &v
}
