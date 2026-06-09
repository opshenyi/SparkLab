package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type teacherSubmissionRow struct {
	ID          string  `gorm:"column:id"`
	UserID      string  `gorm:"column:userId"`
	Username    string  `gorm:"column:username"`
	DisplayName string  `gorm:"column:displayName"`
	LabID       string  `gorm:"column:labId"`
	LabTitle    string  `gorm:"column:labTitle"`
	LabType     string  `gorm:"column:labType"`
	CourseID    string  `gorm:"column:courseId"`
	CourseTitle string  `gorm:"column:courseTitle"`
	Score       int     `gorm:"column:score"`
	MaxScore    int     `gorm:"column:maxScore"`
	Status      string  `gorm:"column:status"`
	Feedback    *string `gorm:"column:feedback"`
	SubmittedAt int64   `gorm:"column:submittedAt"`
	AnswerCount int64   `gorm:"column:answerCount"`
}

func (h *Handler) TeacherListSubmissions(c *gin.Context) {
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
	courseIDs, err := h.courseIDsForTeacherGroup(groupID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课程失败"})
		return
	}
	if len(courseIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"items":   []gin.H{},
			"summary": submissionSummary([]teacherSubmissionRow{}),
		})
		return
	}

	status := strings.ToLower(strings.TrimSpace(c.Query("status")))
	switch status {
	case "", "all", "pending", "passed", "failed":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid status"})
		return
	}

	query := `
SELECT s.id, s.userId, u.username, u.displayName, s.labId,
  l.title AS labTitle, l.type AS labType,
  c.id AS courseId, c.title AS courseTitle,
  s.score, s.maxScore, s.status, s.feedback,
  cast(s.submittedAt as integer) AS submittedAt,
  (SELECT COUNT(1) FROM answers a WHERE a.submissionId = s.id) AS answerCount
FROM submissions s
INNER JOIN users u ON u.id = s.userId AND u.role = 'STUDENT'
INNER JOIN labs l ON l.id = s.labId
INNER JOIN courses c ON c.id = l.courseId
LEFT JOIN group_memberships gm ON gm.userId = u.id AND gm.classId = ?
WHERE (u.classId = ? OR gm.id IS NOT NULL) AND l.courseId IN ?
ORDER BY s.submittedAt DESC, s.id DESC`

	var rows []teacherSubmissionRow
	if err := h.db.Raw(query, groupID, groupID, courseIDs).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载提交失败"})
		return
	}

	filteredRows := rows
	if status != "" && status != "all" {
		filteredRows = make([]teacherSubmissionRow, 0, len(rows))
		for _, row := range rows {
			if row.Status == status {
				filteredRows = append(filteredRows, row)
			}
		}
	}

	items := make([]gin.H, 0, len(filteredRows))
	for _, row := range filteredRows {
		items = append(items, teacherSubmissionResponse(row))
	}
	c.JSON(http.StatusOK, gin.H{
		"items":   items,
		"summary": submissionSummary(rows),
	})
}

func teacherSubmissionResponse(row teacherSubmissionRow) gin.H {
	return gin.H{
		"id":          row.ID,
		"score":       row.Score,
		"maxScore":    row.MaxScore,
		"status":      row.Status,
		"feedback":    row.Feedback,
		"submittedAt": row.SubmittedAt,
		"answerCount": row.AnswerCount,
		"student": gin.H{
			"id":          row.UserID,
			"username":    row.Username,
			"displayName": row.DisplayName,
		},
		"lab": gin.H{
			"id":    row.LabID,
			"title": row.LabTitle,
			"type":  row.LabType,
		},
		"course": gin.H{
			"id":    row.CourseID,
			"title": row.CourseTitle,
		},
	}
}

func submissionSummary(rows []teacherSubmissionRow) gin.H {
	summary := gin.H{"total": len(rows), "pending": 0, "passed": 0, "failed": 0}
	for _, row := range rows {
		if _, ok := summary[row.Status]; ok {
			summary[row.Status] = summary[row.Status].(int) + 1
		}
	}
	return summary
}
