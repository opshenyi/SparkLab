package handler

import (
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handler) refreshCourseProgressForUser(userID, courseID string) (int, error) {
	userID = strings.TrimSpace(userID)
	courseID = strings.TrimSpace(courseID)
	if userID == "" || courseID == "" {
		return 0, nil
	}

	var total int64
	if err := h.db.Model(&model.Lab{}).Where("courseId = ?", courseID).Count(&total).Error; err != nil {
		return 0, err
	}

	progress := 0
	if total > 0 {
		var completed int64
		if err := h.db.Raw(`
SELECT COUNT(*) FROM (
  SELECT DISTINCT l.id
  FROM labs l
  INNER JOIN submissions s ON s.labId = l.id
  WHERE l.courseId = ? AND s.userId = ? AND s.status = 'passed'
  UNION
  SELECT DISTINCT l.id
  FROM labs l
  INNER JOIN video_progress vp ON vp.labId = l.id
  WHERE l.courseId = ? AND vp.userId = ? AND vp.completed = true
) AS done
`, courseID, userID, courseID, userID).Scan(&completed).Error; err != nil {
			return 0, err
		}
		progress = int(math.Round(float64(completed) / float64(total) * 100))
		if progress > 100 {
			progress = 100
		}
	}

	now := model.Now()
	updates := map[string]any{"progress": progress}
	if progress >= 100 && total > 0 {
		updates["completedAt"] = now
	} else {
		updates["completedAt"] = nil
	}

	var enrollment model.Enrollment
	err := h.db.Where("userId = ? AND courseId = ?", userID, courseID).Take(&enrollment).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		enrollment = model.Enrollment{
			ID:        newID(),
			UserID:    userID,
			CourseID:  courseID,
			Progress:  progress,
			StartedAt: now,
		}
		if progress >= 100 && total > 0 {
			completedAt := now
			enrollment.CompletedAt = &completedAt
		}
		if err := h.db.Create(&enrollment).Error; err != nil {
			return progress, err
		}
		return progress, nil
	}
	if err != nil {
		return progress, err
	}
	if err := h.db.Model(&model.Enrollment{}).Where("id = ?", enrollment.ID).Updates(updates).Error; err != nil {
		return progress, err
	}
	return progress, nil
}

func (h *Handler) CompleteVideo(c *gin.Context) {
	labID := c.Param("id")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var req struct {
		WatchedDuration int     `json:"watchedDuration"`
		TotalDuration   int     `json:"totalDuration"`
		Progress        float64 `json:"progress"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request"})
		return
	}

	var lab model.Lab
	if err := h.db.Where("id = ? AND type = ?", labID, "video").First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Video not found"})
		return
	}
	co, err := h.courseByID(lab.CourseID)
	if err != nil || !h.userCanViewCourse(co, uid, role, true) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权完成该视频"})
		return
	}

	totalDuration := req.TotalDuration
	if totalDuration <= 0 {
		totalDuration = lab.VideoDuration
	}
	watchedDuration := req.WatchedDuration
	if watchedDuration < 0 {
		watchedDuration = 0
	}
	if totalDuration > 0 && watchedDuration > totalDuration {
		watchedDuration = totalDuration
	}
	progress := req.Progress
	if totalDuration > 0 && watchedDuration > 0 {
		derived := float64(watchedDuration) / float64(totalDuration) * 100
		if derived > progress {
			progress = derived
		}
	}
	if progress > 100 {
		progress = 100
	}
	completed := progress >= 90
	if !completed {
		c.JSON(http.StatusBadRequest, gin.H{"message": "视频观看进度达到 90% 后才能完成"})
		return
	}

	now := time.Now()
	var existing model.VideoProgress
	err = h.db.Where("userId = ? AND labId = ?", uid, labID).Take(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		existing = model.VideoProgress{
			ID:              newID(),
			UserID:          uid,
			LabID:           labID,
			WatchedDuration: watchedDuration,
			TotalDuration:   totalDuration,
			Completed:       true,
			LastWatchedAt:   now,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := h.db.Create(&existing).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "保存视频进度失败"})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "保存视频进度失败"})
		return
	} else {
		updates := map[string]any{
			"watchedDuration": watchedDuration,
			"totalDuration":   totalDuration,
			"completed":       true,
			"lastWatchedAt":   now,
			"updatedAt":       now,
		}
		if err := h.db.Model(&model.VideoProgress{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "保存视频进度失败"})
			return
		}
	}

	courseProgress, err := h.refreshCourseProgressForUser(uid, lab.CourseID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "刷新课程进度失败"})
		return
	}
	_ = h.LogActivity(uid, "complete_video", "lab", lab.ID, lab.Title)

	c.JSON(http.StatusOK, gin.H{
		"completed":      true,
		"progress":       progress,
		"courseId":       lab.CourseID,
		"courseProgress": courseProgress,
	})
}
