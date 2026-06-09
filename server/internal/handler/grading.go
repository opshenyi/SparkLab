package handler

import (
	"net/http"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

type submissionContext struct {
	Submission model.Submission
	Lab        model.Lab
	Course     model.Course
}

type gradeSubmissionReq struct {
	Score    *int    `json:"score"`
	Feedback *string `json:"feedback"`
	Answers  []struct {
		QuestionID string `json:"questionId"`
		Score      int    `json:"score"`
	} `json:"answers"`
}

func (h *Handler) loadSubmissionContext(submissionID string) (*submissionContext, error) {
	var submission model.Submission
	if err := h.db.Where("id = ?", submissionID).First(&submission).Error; err != nil {
		return nil, err
	}
	var lab model.Lab
	if err := h.db.Where("id = ?", submission.LabID).First(&lab).Error; err != nil {
		return nil, err
	}
	var course model.Course
	if err := h.db.Where("id = ?", lab.CourseID).First(&course).Error; err != nil {
		return nil, err
	}
	return &submissionContext{Submission: submission, Lab: lab, Course: course}, nil
}

func (h *Handler) userCanViewSubmission(ctx *submissionContext, userID, role string) bool {
	switch role {
	case "ADMIN", "AUTHOR":
		return true
	case "TEACHER":
		return h.teacherCanReviewStudentSubmission(userID, ctx.Submission.UserID, ctx.Course.ID)
	default:
		return ctx.Submission.UserID == userID && h.userCanViewCourse(&ctx.Course, userID, role, true)
	}
}

func (h *Handler) userCanGradeSubmission(ctx *submissionContext, userID, role string) bool {
	switch role {
	case "ADMIN", "AUTHOR":
		return true
	case "TEACHER":
		return h.teacherCanReviewStudentSubmission(userID, ctx.Submission.UserID, ctx.Course.ID)
	default:
		return false
	}
}

func submissionStatusForScore(score, maxScore int) string {
	if maxScore <= 0 {
		if score > 0 {
			return "passed"
		}
		return "failed"
	}
	if score >= int(float64(maxScore)*0.6) {
		return "passed"
	}
	return "failed"
}

func (h *Handler) GradeSubmission(c *gin.Context) {
	submissionID := c.Param("submissionId")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	ctx, err := h.loadSubmissionContext(submissionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Submission not found"})
		return
	}
	if !h.userCanGradeSubmission(ctx, uid, role) {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}

	var req gradeSubmissionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	if req.Score == nil && req.Feedback == nil && len(req.Answers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "No grading changes"})
		return
	}

	tx := h.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var submission model.Submission
	if err := tx.Where("id = ?", submissionID).First(&submission).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"message": "Submission not found"})
		return
	}

	seen := make(map[string]struct{}, len(req.Answers))
	for _, gradedAnswer := range req.Answers {
		questionID := strings.TrimSpace(gradedAnswer.QuestionID)
		if questionID == "" {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid questionId"})
			return
		}
		if _, ok := seen[questionID]; ok {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"message": "Duplicate questionId"})
			return
		}
		seen[questionID] = struct{}{}

		var answer model.Answer
		if err := tx.Where("submissionId = ? AND questionId = ?", submissionID, questionID).Take(&answer).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"message": "Answer does not belong to this submission"})
			return
		}
		var question model.Question
		if err := tx.Where("id = ? AND labId = ?", questionID, submission.LabID).Take(&question).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"message": "Question does not belong to this submission"})
			return
		}
		if gradedAnswer.Score < 0 || gradedAnswer.Score > question.Points {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"message": "Score out of range"})
			return
		}
		if err := tx.Model(&model.Answer{}).Where("id = ?", answer.ID).Updates(map[string]any{
			"score":     gradedAnswer.Score,
			"isCorrect": question.Points > 0 && gradedAnswer.Score == question.Points,
		}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update answer score"})
			return
		}
	}

	var answerCount int64
	if err := tx.Model(&model.Answer{}).Where("submissionId = ?", submissionID).Count(&answerCount).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to recalculate score"})
		return
	}

	nextScore := submission.Score
	if answerCount > 0 {
		type scoreRow struct {
			Total int `gorm:"column:total"`
		}
		var row scoreRow
		if err := tx.Model(&model.Answer{}).Select("COALESCE(SUM(score), 0) AS total").Where("submissionId = ?", submissionID).Scan(&row).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to recalculate score"})
			return
		}
		nextScore = row.Total
		if nextScore > submission.MaxScore {
			nextScore = submission.MaxScore
		}
	} else if req.Score != nil {
		nextScore = *req.Score
	}
	if nextScore < 0 || nextScore > submission.MaxScore {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"message": "Score out of range"})
		return
	}

	updates := map[string]any{
		"score":  nextScore,
		"status": submissionStatusForScore(nextScore, submission.MaxScore),
	}
	if req.Feedback != nil {
		feedback := strings.TrimSpace(*req.Feedback)
		if feedback == "" {
			updates["feedback"] = nil
		} else {
			updates["feedback"] = feedback
		}
	}
	if err := tx.Model(&model.Submission{}).Where("id = ?", submissionID).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save grading"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save grading"})
		return
	}

	_ = h.LogActivity(uid, "grade_submission", "submission", submissionID, ctx.Lab.Title)
	_, _ = h.refreshCourseProgressForUser(submission.UserID, ctx.Course.ID)

	c.JSON(http.StatusOK, gin.H{
		"id":       submissionID,
		"score":    nextScore,
		"maxScore": submission.MaxScore,
		"status":   submissionStatusForScore(nextScore, submission.MaxScore),
	})
}
