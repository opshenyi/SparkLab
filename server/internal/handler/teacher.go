package handler

import (
	"math"
	"net/http"
	"sort"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RequireTeacher() gin.HandlerFunc {
	return func(c *gin.Context) {
		if userRoleFromCtx(c) != "TEACHER" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
			return
		}
		if _, ok := userIDFromCtx(c); !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
			return
		}
		c.Next()
	}
}

func (h *Handler) TeacherOverview(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	cid := strings.TrimSpace(c.Query("groupId"))
	if cid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请指定学习小组 groupId"})
		return
	}
	if !h.teacherIsAdvisorOfGroup(uid, cid) {
		c.JSON(http.StatusForbidden, gin.H{"message": "您不是该小组的小组老师，无法查看学情"})
		return
	}
	var cl model.Class
	_ = h.db.Where("id = ?", cid).First(&cl).Error
	studentCount := h.countGroupStudents(cid)
	courseIDs, err := h.courseIDsForTeacherGroup(cid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载失败"})
		return
	}
	var courseCount int64
	if len(courseIDs) > 0 {
		h.db.Model(&model.Course{}).Where("id IN ?", courseIDs).Count(&courseCount)
	}
	var activeCourseCount int64
	if len(courseIDs) > 0 {
		h.db.Model(&model.Course{}).Where("id IN ? AND isActive = ?", courseIDs, true).Count(&activeCourseCount)
	}

	var labCount, materialCount int64
	if len(courseIDs) > 0 {
		h.db.Model(&model.Lab{}).Where("courseId IN ?", courseIDs).Count(&labCount)
		h.db.Model(&model.CourseMaterial{}).Where("courseId IN ?", courseIDs).Count(&materialCount)
	}

	var submissionCount int64
	h.db.Model(&model.Submission{}).
		Joins(`INNER JOIN users u ON u.id = submissions.userId AND u.role = 'STUDENT'`).
		Joins(`LEFT JOIN group_memberships gm ON gm.userId = u.id AND gm.classId = ?`, cid).
		Where("u.classId = ? OR gm.id IS NOT NULL", cid).
		Count(&submissionCount)

	var runningContainers int64
	h.db.Model(&model.Container{}).
		Joins(`INNER JOIN users u ON u.id = containers.userId AND u.role = 'STUDENT'`).
		Joins(`LEFT JOIN group_memberships gm ON gm.userId = u.id AND gm.classId = ?`, cid).
		Where("(u.classId = ? OR gm.id IS NOT NULL) AND containers.status = ?", cid, cid, "running").
		Count(&runningContainers)

	c.JSON(http.StatusOK, gin.H{
		"group": gin.H{
			"id":   cl.ID,
			"name": cl.Name,
		},
		"class": gin.H{
			"id":   cl.ID,
			"name": cl.Name,
		},
		"studentCount":        studentCount,
		"courseCount":         courseCount,
		"activeCourseCount":   activeCourseCount,
		"labCount":            labCount,
		"materialCount":       materialCount,
		"submissionCount":     submissionCount,
		"runningContainers":   runningContainers,
	})
}

func teacherLearningInsight(subCount, passedCount int64, avgRatio float64) (level, label string, avgPct, passPct int) {
	if subCount == 0 {
		return "none", "暂无提交", 0, 0
	}
	passPct = int(math.Round(float64(passedCount) / float64(subCount) * 100))
	avgPct = int(math.Round(avgRatio * 100))
	score := avgPct
	if avgRatio <= 0 {
		score = passPct
	}
	switch {
	case score >= 85 && passPct >= 45:
		return "excellent", "优秀", avgPct, passPct
	case score >= 70:
		return "good", "良好", avgPct, passPct
	case score >= 55:
		return "average", "一般", avgPct, passPct
	default:
		return "weak", "需加强", avgPct, passPct
	}
}

func (h *Handler) TeacherListStudents(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	cid := strings.TrimSpace(c.Query("groupId"))
	if cid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请指定学习小组 groupId"})
		return
	}
	if !h.teacherIsAdvisorOfGroup(uid, cid) {
		c.JSON(http.StatusForbidden, gin.H{"message": "您不是该小组的小组老师"})
		return
	}
	type row struct {
		ID          string `gorm:"column:id"`
		Username    string `gorm:"column:username"`
		DisplayName string `gorm:"column:displayName"`
		CreatedAt   int64  `gorm:"column:createdAt"`
	}
	var rows []row
	err := h.db.Table("users").
		Select("DISTINCT users.id, users.username, users.displayName, cast(users.createdAt as integer) as createdAt").
		Joins("LEFT JOIN group_memberships gm ON gm.userId = users.id AND gm.classId = ?", cid).
		Where("users.role = ? AND (users.classId = ? OR gm.id IS NOT NULL)", "STUDENT", cid).
		Order("users.createdAt desc").
		Find(&rows).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载学生失败"})
		return
	}

	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}

	type aggRow struct {
		UserID          string  `gorm:"column:userId"`
		SubmissionCount int64   `gorm:"column:submissionCount"`
		PassedCount     int64   `gorm:"column:passedCount"`
		AvgRatio        float64 `gorm:"column:avgRatio"`
	}
	aggByUser := map[string]aggRow{}
	if len(ids) > 0 {
		var aggs []aggRow
		q := `
SELECT userId,
  COUNT(*) AS submissionCount,
  SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passedCount,
  COALESCE(AVG(CASE WHEN maxScore > 0 THEN (CAST(score AS REAL) / maxScore) ELSE NULL END), 0) AS avgRatio
FROM submissions
WHERE userId IN ?
GROUP BY userId`
		if err := h.db.Raw(q, ids).Scan(&aggs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "加载学习数据失败"})
			return
		}
		for _, a := range aggs {
			aggByUser[a.UserID] = a
		}
	}

	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		a := aggByUser[r.ID]
		level, label, avgPct, passPct := teacherLearningInsight(a.SubmissionCount, a.PassedCount, a.AvgRatio)
		out = append(out, gin.H{
			"id":              r.ID,
			"username":        r.Username,
			"displayName":     r.DisplayName,
			"createdAt":       r.CreatedAt,
			"submissionCount": a.SubmissionCount,
			"passedCount":     a.PassedCount,
			"passRatePercent": passPct,
			"avgScorePercent": avgPct,
			"learningLevel":   level,
			"learningLabel":   label,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) TeacherListCourses(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	ids := h.teacherAdvisedGroupIDs(uid)
	if len(ids) == 0 {
		c.JSON(http.StatusOK, []model.Course{})
		return
	}
	cid := strings.TrimSpace(c.Query("groupId"))
	visible, err := h.courseIDsVisibleForGroups(ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课程失败"})
		return
	}
	if len(visible) == 0 {
		c.JSON(http.StatusOK, []model.Course{})
		return
	}
	if cid != "" {
		if !h.teacherIsAdvisorOfGroup(uid, cid) {
			c.JSON(http.StatusForbidden, gin.H{"message": "您不是该小组的小组老师"})
			return
		}
		inGroup, err := h.courseIDsForTeacherGroup(cid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课程失败"})
			return
		}
		inSet := make(map[string]struct{}, len(inGroup))
		for _, x := range inGroup {
			inSet[x] = struct{}{}
		}
		var filtered []string
		for _, x := range visible {
			if _, ok := inSet[x]; ok {
				filtered = append(filtered, x)
			}
		}
		visible = filtered
	}
	q := h.db.Model(&model.Course{}).Where("id IN ?", visible)
	var courses []model.Course
	if err := q.Order("createdAt desc").Find(&courses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课程失败"})
		return
	}
	c.JSON(http.StatusOK, courses)
}

func (h *Handler) TeacherCreateCourse(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	var req adminCoursePayload
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" || req.Description == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	var groupIDs []string
	if req.ClassIDs != nil {
		groupIDs = dedupeTrimmedStrings(*req.ClassIDs)
	}
	if len(groupIDs) == 0 && req.ClassID != nil {
		s := strings.TrimSpace(*req.ClassID)
		if s != "" {
			groupIDs = []string{s}
		}
	}
	if len(groupIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请至少指定一个学习小组（classIds 或 classId）"})
		return
	}
	for _, gid := range groupIDs {
		if !h.teacherIsAdvisorOfGroup(uid, gid) {
			c.JSON(http.StatusForbidden, gin.H{"message": "您不是其中某小组的小组老师，不能将课程分配到该组"})
			return
		}
	}
	sort.Strings(groupIDs)
	first := groupIDs[0]
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	diff := req.Difficulty
	if diff == "" {
		diff = "beginner"
	}
	course := model.Course{
		ID:          newID(),
		Title:       req.Title,
		Description: req.Description,
		Cover:       req.Cover,
		Difficulty:  diff,
		Duration:    req.Duration,
		IsActive:    isActive,
		ClassID:     &first,
		CreatedAt:   model.Now(),
		UpdatedAt:   model.Now(),
	}
	if err := h.db.Create(&course).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Create course failed"})
		return
	}
	if err := h.replaceCourseClassLinks(course.ID, groupIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "关联学习小组失败"})
		return
	}
	c.JSON(http.StatusOK, course)
}

func (h *Handler) TeacherUpdateCourse(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	id := c.Param("id")
	if !h.teacherManagesCourse(uid, id) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权编辑该课程"})
		return
	}
	var req adminCoursePayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	updates := map[string]any{"updatedAt": model.Now()}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Cover != nil {
		updates["cover"] = req.Cover
	}
	if req.Difficulty != "" {
		updates["difficulty"] = req.Difficulty
	}
	if req.Duration > 0 {
		updates["duration"] = req.Duration
	}
	if req.IsActive != nil {
		updates["isActive"] = *req.IsActive
	}
	if err := h.db.Model(&model.Course{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Update course failed"})
		return
	}
	if req.ClassIDs != nil {
		groups := dedupeTrimmedStrings(*req.ClassIDs)
		if len(groups) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "请至少保留一个学习小组"})
			return
		}
		for _, g := range groups {
			if !h.teacherIsAdvisorOfGroup(uid, g) {
				c.JSON(http.StatusForbidden, gin.H{"message": "您不是其中某小组的小组老师，无法将课程分配到该组"})
				return
			}
		}
		sort.Strings(groups)
		if err := h.replaceCourseClassLinks(id, groups); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "更新学习小组关联失败"})
			return
		}
	} else if req.ClassID != nil {
		s := strings.TrimSpace(*req.ClassID)
		if s == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "课程须归属某一学习小组，不能改为全校公开课"})
			return
		}
		if !h.teacherIsAdvisorOfGroup(uid, s) {
			c.JSON(http.StatusForbidden, gin.H{"message": "您不是目标小组的小组老师，无法将课程分配到该组"})
			return
		}
		if err := h.replaceCourseClassLinks(id, []string{s}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "更新学习小组关联失败"})
			return
		}
	}
	var course model.Course
	h.db.Where("id = ?", id).First(&course)
	c.JSON(http.StatusOK, course)
}

func (h *Handler) TeacherToggleCourseActive(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	id := c.Param("id")
	if !h.teacherManagesCourse(uid, id) {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}
	var course model.Course
	if err := h.db.Where("id = ?", id).First(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}
	newStatus := !course.IsActive
	if err := h.db.Model(&model.Course{}).Where("id = ?", id).Update("isActive", newStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Toggle course status failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok", "isActive": newStatus})
}

func (h *Handler) TeacherCreateLab(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	var req adminLabPayload
	if err := c.ShouldBindJSON(&req); err != nil || req.CourseID == "" || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	if !h.teacherManagesCourse(uid, req.CourseID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权在该课程下创建内容"})
		return
	}
	lab := newLabFromAdminPayload(&req)
	if err := h.db.Create(&lab).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Create lab failed"})
		return
	}
	c.JSON(http.StatusOK, lab)
}

func (h *Handler) TeacherUpdateLab(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	id := c.Param("id")
	var existing model.Lab
	if err := h.db.Where("id = ?", id).First(&existing).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}
	if !h.teacherManagesCourse(uid, existing.CourseID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}
	var req adminLabPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	updates := map[string]any{"updatedAt": model.Now()}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	updates["content"] = req.Content
	if req.Difficulty != "" {
		updates["difficulty"] = req.Difficulty
	}
	if req.Order > 0 {
		updates["order"] = req.Order
	}
	if req.Points > 0 {
		updates["points"] = req.Points
	}
	if req.TimeLimit > 0 {
		updates["timeLimit"] = req.TimeLimit
	}
	if req.VideoURL != nil && *req.VideoURL != "" {
		updates["videoUrl"] = *req.VideoURL
	}
	if req.VideoDuration > 0 {
		updates["videoDuration"] = req.VideoDuration
	}
	updates["serverId"] = req.ServerID
	if req.DockerImage != "" {
		updates["dockerImage"] = req.DockerImage
	}
	if req.CPULimit > 0 {
		updates["cpuLimit"] = req.CPULimit
	}
	if req.MemoryLimit > 0 {
		updates["memoryLimit"] = req.MemoryLimit
	}
	if req.ShellCommand != nil {
		updates["shellCommand"] = *req.ShellCommand
	}
	if req.RestartPolicy != nil {
		updates["restartPolicy"] = *req.RestartPolicy
	}
	if req.PortMappings != nil {
		updates["portMappings"] = toJSONStringPtr(req.PortMappings)
	}
	if req.EnvironmentVars != nil {
		updates["environmentVars"] = toJSONStringPtr(req.EnvironmentVars)
	}
	if req.VolumeMounts != nil {
		updates["volumeMounts"] = toJSONStringPtr(req.VolumeMounts)
	}
	if req.JudgeType != nil {
		updates["judgeType"] = *req.JudgeType
	}
	if req.JudgeScript != nil {
		updates["judgeScript"] = req.JudgeScript
	}
	if err := h.db.Model(&model.Lab{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Update lab failed"})
		return
	}
	var lab model.Lab
	h.db.Where("id = ?", id).First(&lab)
	c.JSON(http.StatusOK, lab)
}

func (h *Handler) TeacherGetLab(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	id := c.Param("id")
	var lab model.Lab
	if err := h.db.Where("id = ?", id).First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}
	if !h.teacherManagesCourse(uid, lab.CourseID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
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
	})
}

func (h *Handler) TeacherSaveExamQuestions(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	labID := c.Param("id")
	courseID, err := h.labCourseID(labID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}
	if !h.teacherManagesCourse(uid, courseID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}
	h.persistExamQuestions(c, labID)
}
