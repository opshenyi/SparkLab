package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// LogActivity 记录用户活动
func (h *Handler) LogActivity(userID, action, targetType, targetID, targetName string) error {
	return h.db.Exec(`
		INSERT INTO activity_logs (id, userId, action, targetType, targetId, targetName, createdAt)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, newID(), userID, action, targetType, targetID, targetName, time.Now()).Error
}

// GetUserActivities 获取用户最近的活动记录
func (h *Handler) GetUserActivities(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	
	var activities []struct {
		ID         string    `gorm:"column:id" json:"id"`
		Action     string    `gorm:"column:action" json:"action"`
		TargetType *string   `gorm:"column:targetType" json:"targetType,omitempty"`
		TargetID   *string   `gorm:"column:targetId" json:"targetId,omitempty"`
		TargetName *string   `gorm:"column:targetName" json:"targetName,omitempty"`
		CreatedAt  time.Time `gorm:"column:createdAt" json:"createdAt"`
	}
	
	if err := h.db.Table("activity_logs").
		Where("userId = ?", uid).
		Order("createdAt DESC").
		Limit(20).
		Find(&activities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to load activities"})
		return
	}
	
	c.JSON(http.StatusOK, activities)
}
