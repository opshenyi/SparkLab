package handler

import (
	"math"
	"net/http"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

type teacherGradebookStudentRow struct {
	ID          string `gorm:"column:id"`
	Username    string `gorm:"column:username"`
	DisplayName string `gorm:"column:displayName"`
	CreatedAt   int64  `gorm:"column:createdAt"`
}

type teacherGradebookCourseRow struct {
	ID      string `gorm:"column:id"`
	Title   string `gorm:"column:title"`
	Content int64  `gorm:"column:contentCount"`
}

type teacherGradebookSubmissionAgg struct {
	UserID          string  `gorm:"column:userId"`
	SubmissionCount int64   `gorm:"column:submissionCount"`
	PassedCount     int64   `gorm:"column:passedCount"`
	PendingCount    int64   `gorm:"column:pendingCount"`
	FailedCount     int64   `gorm:"column:failedCount"`
	TotalScore      int64   `gorm:"column:totalScore"`
	TotalMaxScore   int64   `gorm:"column:totalMaxScore"`
	AvgRatio        float64 `gorm:"column:avgRatio"`
	LastSubmittedAt int64   `gorm:"column:lastSubmittedAt"`
}

type teacherGradebookEnrollmentRow struct {
	UserID   string `gorm:"column:userId"`
	CourseID string `gorm:"column:courseId"`
	Progress int    `gorm:"column:progress"`
}

func (h *Handler) TeacherGradebook(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	groupID := strings.TrimSpace(c.Query("groupId"))
	if groupID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请指定学习小组 groupId"})
		return
	}
	if !h.teacherIsAdvisorOfGroup(uid, groupID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "您不是该小组的小组老师"})
		return
	}

	allCourseIDs, err := h.courseIDsForTeacherGroup(groupID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课程失败"})
		return
	}
	allCourseIDs = dedupeTrimmedStrings(allCourseIDs)
	courseIDs := append([]string(nil), allCourseIDs...)
	courseID := strings.TrimSpace(c.Query("courseId"))
	if courseID != "" {
		if !containsString(allCourseIDs, courseID) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "课程不属于该学习小组"})
			return
		}
		courseIDs = []string{courseID}
	}

	courses := []teacherGradebookCourseRow{}
	if len(allCourseIDs) > 0 {
		if err := h.db.Raw(`
SELECT c.id, c.title, COUNT(l.id) AS contentCount
FROM courses c
LEFT JOIN labs l ON l.courseId = c.id
WHERE c.id IN ?
GROUP BY c.id, c.title
ORDER BY c.createdAt DESC, c.id DESC
`, allCourseIDs).Scan(&courses).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课程失败"})
			return
		}
	}

	var students []teacherGradebookStudentRow
	if err := h.db.Table("users").
		Select("DISTINCT users.id, users.username, users.displayName, cast(users.createdAt as integer) as createdAt").
		Joins("LEFT JOIN group_memberships gm ON gm.userId = users.id AND gm.classId = ?", groupID).
		Where("users.role = ? AND (users.classId = ? OR gm.id IS NOT NULL)", "STUDENT", groupID).
		Order("users.displayName asc, users.username asc").
		Find(&students).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载学生失败"})
		return
	}

	studentIDs := make([]string, 0, len(students))
	for _, student := range students {
		studentIDs = append(studentIDs, student.ID)
	}

	enrollmentsByUser := map[string]map[string]int{}
	if len(studentIDs) > 0 && len(courseIDs) > 0 {
		var enrollments []teacherGradebookEnrollmentRow
		if err := h.db.Model(&model.Enrollment{}).
			Select("userId, courseId, progress").
			Where("userId IN ? AND courseId IN ?", studentIDs, courseIDs).
			Scan(&enrollments).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "加载进度失败"})
			return
		}
		for _, enrollment := range enrollments {
			if enrollmentsByUser[enrollment.UserID] == nil {
				enrollmentsByUser[enrollment.UserID] = map[string]int{}
			}
			enrollmentsByUser[enrollment.UserID][enrollment.CourseID] = enrollment.Progress
		}
	}

	submissionsByUser := map[string]teacherGradebookSubmissionAgg{}
	if len(studentIDs) > 0 && len(courseIDs) > 0 {
		var aggs []teacherGradebookSubmissionAgg
		if err := h.db.Raw(`
SELECT s.userId,
  COUNT(*) AS submissionCount,
  SUM(CASE WHEN s.status = 'passed' THEN 1 ELSE 0 END) AS passedCount,
  SUM(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
  SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) AS failedCount,
  COALESCE(SUM(s.score), 0) AS totalScore,
  COALESCE(SUM(s.maxScore), 0) AS totalMaxScore,
  COALESCE(AVG(CASE WHEN s.maxScore > 0 THEN (CAST(s.score AS REAL) / s.maxScore) ELSE NULL END), 0) AS avgRatio,
  COALESCE(MAX(cast(s.submittedAt as integer)), 0) AS lastSubmittedAt
FROM submissions s
INNER JOIN labs l ON l.id = s.labId
WHERE s.userId IN ? AND l.courseId IN ?
GROUP BY s.userId
`, studentIDs, courseIDs).Scan(&aggs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "加载成绩失败"})
			return
		}
		for _, agg := range aggs {
			submissionsByUser[agg.UserID] = agg
		}
	}

	items := make([]gin.H, 0, len(students))
	summary := gin.H{
		"studentCount":       len(students),
		"courseCount":        len(courseIDs),
		"avgProgressPercent": 0,
		"avgScorePercent":    0,
		"passedCount":        int64(0),
		"pendingCount":       int64(0),
		"failedCount":        int64(0),
	}
	totalProgress := 0
	totalAvgScore := 0
	scoredStudents := 0
	for _, student := range students {
		progress, completedCourses, enrolledCourses := gradebookProgressForStudent(enrollmentsByUser[student.ID], courseIDs)
		agg := submissionsByUser[student.ID]
		avgScorePercent := int(math.Round(agg.AvgRatio * 100))
		if agg.SubmissionCount > 0 {
			scoredStudents++
			totalAvgScore += avgScorePercent
		}
		totalProgress += progress
		summary["passedCount"] = summary["passedCount"].(int64) + agg.PassedCount
		summary["pendingCount"] = summary["pendingCount"].(int64) + agg.PendingCount
		summary["failedCount"] = summary["failedCount"].(int64) + agg.FailedCount

		items = append(items, gin.H{
			"student": gin.H{
				"id":          student.ID,
				"username":    student.Username,
				"displayName": student.DisplayName,
				"createdAt":   student.CreatedAt,
			},
			"progressPercent":  progress,
			"completedCourses": completedCourses,
			"enrolledCourses":  enrolledCourses,
			"courseCount":      len(courseIDs),
			"submissionCount":  agg.SubmissionCount,
			"passedCount":      agg.PassedCount,
			"pendingCount":     agg.PendingCount,
			"failedCount":      agg.FailedCount,
			"totalScore":       agg.TotalScore,
			"totalMaxScore":    agg.TotalMaxScore,
			"avgScorePercent":  avgScorePercent,
			"lastSubmittedAt":  agg.LastSubmittedAt,
			"riskLevel":        gradebookRiskLevel(progress, avgScorePercent, agg),
		})
	}
	if len(students) > 0 {
		summary["avgProgressPercent"] = int(math.Round(float64(totalProgress) / float64(len(students))))
	}
	if scoredStudents > 0 {
		summary["avgScorePercent"] = int(math.Round(float64(totalAvgScore) / float64(scoredStudents)))
	}

	c.JSON(http.StatusOK, gin.H{
		"groupId":  groupID,
		"courseId": courseID,
		"courses":  gradebookCourseResponse(courses),
		"items":    items,
		"summary":  summary,
	})
}

func gradebookCourseResponse(rows []teacherGradebookCourseRow) []gin.H {
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		out = append(out, gin.H{
			"id":           row.ID,
			"title":        row.Title,
			"contentCount": row.Content,
		})
	}
	return out
}

func gradebookProgressForStudent(progressByCourse map[string]int, courseIDs []string) (progress, completedCourses, enrolledCourses int) {
	if len(courseIDs) == 0 {
		return 0, 0, 0
	}
	total := 0
	for _, courseID := range courseIDs {
		p, ok := progressByCourse[courseID]
		if ok {
			enrolledCourses++
		}
		if p < 0 {
			p = 0
		}
		if p > 100 {
			p = 100
		}
		if p >= 100 {
			completedCourses++
		}
		total += p
	}
	return int(math.Round(float64(total) / float64(len(courseIDs)))), completedCourses, enrolledCourses
}

func gradebookRiskLevel(progress, avgScore int, agg teacherGradebookSubmissionAgg) string {
	switch {
	case agg.PendingCount > 0:
		return "pending"
	case agg.SubmissionCount == 0 && progress == 0:
		return "inactive"
	case agg.SubmissionCount > 0 && avgScore < 60:
		return "risk"
	case progress >= 100:
		return "completed"
	default:
		return "normal"
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
