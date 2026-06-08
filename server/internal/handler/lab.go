package handler

import (
	"net/http"
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
	if hasUser {
		var s model.Submission
		if err := h.db.Where("userId = ? AND labId = ?", uid, lab.ID).
			Order("submittedAt desc").Limit(1).Find(&s).Error; err == nil && s.ID != "" {
			lastSubmission = &s
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
	co, err := h.courseByID(lab.CourseID)
	if err != nil || !h.userCanViewCourse(co, uid, role, true) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权提交"})
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
	if err := h.db.Create(&s).Error; err != nil {
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
				if resp, err := h.dockerRequest(nil, "POST", "/containers/"+ct.ContainerID+"/stop", nil, nil); err == nil {
					resp.Body.Close()
				}
			}

			// 调用 Docker API 删除容器
			resp, err := h.dockerRequest(nil, "DELETE", "/containers/"+ct.ContainerID+"?force=true", nil, nil)
			if err == nil {
				resp.Body.Close()
			}
		}

		// 从数据库中删除记录
		_ = h.db.Delete(&model.Container{}, "id = ?", ct.ID).Error
	}

	c.JSON(http.StatusOK, s)
}
