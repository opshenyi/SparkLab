package handler

import (
	"net/http"
	"net/url"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GetLab(c *gin.Context) {
	id := c.Param("id")
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var lab model.Lab
	if err := h.db.Where("id = ?", id).First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}

	var course model.Course
	h.db.Where("id = ?", lab.CourseID).Limit(1).Find(&course)
	if !h.userCanViewCourse(&course, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问"})
		return
	}

	var steps []model.Step
	h.db.Where("labId = ?", lab.ID).Order("`order` asc").Find(&steps)

	var lastSubmission *model.Submission
	var videoProgress *gin.H
	if hasUser {
		var s model.Submission
		if err := h.db.Where("userId = ? AND labId = ?", uid, lab.ID).
			Order("submittedAt desc").Limit(1).Find(&s).Error; err == nil && s.ID != "" {
			lastSubmission = &s
		}
		if lab.Type == "video" {
			var vp model.VideoProgress
			if err := h.db.Where("userId = ? AND labId = ?", uid, lab.ID).Limit(1).Find(&vp).Error; err == nil && vp.ID != "" {
				videoProgress = &gin.H{
					"watchedDuration": vp.WatchedDuration,
					"totalDuration":   vp.TotalDuration,
					"completed":       vp.Completed,
					"lastWatchedAt":   vp.LastWatchedAt,
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":             lab.ID,
		"courseId":       lab.CourseID,
		"type":           lab.Type,
		"title":          lab.Title,
		"description":    lab.Description,
		"content":        lab.Content,
		"difficulty":     lab.Difficulty,
		"order":          lab.Order,
		"points":         lab.Points,
		"timeLimit":      lab.TimeLimit,
		"videoUrl":       lab.VideoURL,
		"videoDuration":  lab.VideoDuration,
		"dockerImage":    lab.DockerImage,
		"shellCommand":   lab.ShellCmd,
		"judgeType":      lab.JudgeType,
		"judgeScript":    lab.JudgeScript,
		"course":         gin.H{"id": course.ID, "title": course.Title, "isActive": course.IsActive},
		"steps":          steps,
		"lastSubmission": lastSubmission,
		"videoProgress":  videoProgress,
	})
}

func (h *Handler) GetLabsByCourse(c *gin.Context) {
	courseID := c.Param("courseId")
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)
	co, err := h.courseByID(courseID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}
	if !h.userCanViewCourse(co, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问"})
		return
	}
	var labs []model.Lab
	if err := h.db.Where("courseId = ?", courseID).Order("`order` asc").Find(&labs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load labs failed"})
		return
	}

	resp := make([]gin.H, 0, len(labs))
	for _, lab := range labs {
		var steps []model.Step
		h.db.Where("labId = ?", lab.ID).Select("id,title,`order`").Order("`order` asc").Find(&steps)
		resp = append(resp, gin.H{
			"id":              lab.ID,
			"courseId":        lab.CourseID,
			"type":            lab.Type,
			"title":           lab.Title,
			"description":     lab.Description,
			"content":         lab.Content,
			"difficulty":      lab.Difficulty,
			"order":           lab.Order,
			"points":          lab.Points,
			"timeLimit":       lab.TimeLimit,
			"videoUrl":        lab.VideoURL,
			"videoDuration":   lab.VideoDuration,
			"serverId":        lab.ServerID,
			"dockerImage":     lab.DockerImage,
			"cpuLimit":        lab.CPULimit,
			"memoryLimit":     lab.MemoryLimit,
			"shellCommand":    lab.ShellCmd,
			"portMappings":    lab.PortMappings,
			"environmentVars": lab.EnvironmentVars,
			"volumeMounts":    lab.VolumeMounts,
			"restartPolicy":   lab.RestartPolicy,
			"judgeType":       lab.JudgeType,
			"judgeScript":     lab.JudgeScript,
			"steps":           steps,
		})
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) SubmitLab(c *gin.Context) {
	labID := c.Param("id")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var lab model.Lab
	if err := h.db.Where("id = ?", labID).First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}
	if lab.Type != "" && lab.Type != "lab" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Only hands-on labs can be submitted here"})
		return
	}
	co, err := h.courseByID(lab.CourseID)
	if err != nil || !h.userCanViewCourse(co, uid, role, true) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权提交"})
		return
	}
	if !h.userCanPerformTrainingAction(co, uid, role, true) {
		c.JSON(http.StatusForbidden, gin.H{"message": "请先报名课程后再提交实验"})
		return
	}

	tx := h.db.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Submit failed"})
		return
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var existingCount int64
	if err := tx.Model(&model.Submission{}).
		Where("userId = ? AND labId = ? AND status IN ?", uid, labID, []string{"pending", "passed"}).
		Count(&existingCount).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Submit failed"})
		return
	}
	if existingCount > 0 {
		var existing model.Submission
		if err := tx.Where("userId = ? AND labId = ? AND status IN ?", uid, labID, []string{"pending", "passed"}).
			Order("submittedAt desc").
			Take(&existing).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Submit failed"})
			return
		}
		tx.Rollback()
		message := "该实验已有待批改提交，请等待老师批改"
		if existing.Status == "passed" {
			message = "该实验已通过，不能重复提交"
		}
		c.JSON(http.StatusConflict, gin.H{
			"message":      message,
			"submissionId": existing.ID,
			"status":       existing.Status,
		})
		return
	}

	s := model.Submission{
		ID:          newID(),
		UserID:      uid,
		LabID:       labID,
		Status:      "pending",
		MaxScore:    lab.Points,
		Score:       0,
		SubmittedAt: model.Now(),
	}
	if err := tx.Create(&s).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Submit failed"})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Submit failed"})
		return
	}

	// 查找并销毁该用户在该实验的所有容器
	var containers []model.Container
	h.db.Where("userId = ? AND labId = ? AND status IN ?", uid, labID, []string{"running", "stopped", "creating"}).Find(&containers)
	for _, ct := range containers {
		if strings.TrimSpace(ct.ContainerID) != "" {
			// 如果容器正在运行，先停止
			if ct.Status == "running" {
				if resp, err := h.dockerRequest(nil, "POST", "/containers/"+url.PathEscape(ct.ContainerID)+"/stop", nil, nil); err == nil {
					resp.Body.Close()
				}
			}

			// 调用 Docker API 删除容器
			resp, err := h.dockerRequest(nil, "DELETE", "/containers/"+url.PathEscape(ct.ContainerID)+"?force=true", nil, nil)
			if err == nil {
				resp.Body.Close()
			}
		}

		// 从数据库中删除记录
		_ = h.db.Delete(&model.Container{}, "id = ?", ct.ID).Error
	}

	c.JSON(http.StatusOK, s)
}
