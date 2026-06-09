package handler

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type adminUserPayload struct {
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	Password    *string `json:"password"`
	Role        *string `json:"role"`
	QQNumber    *string `json:"qqNumber"`
	ClassID     *string `json:"classId"`
}

func validAdminAssignableRole(role string) bool {
	switch strings.TrimSpace(role) {
	case "STUDENT", "TEACHER", "ADMIN", "AUTHOR":
		return true
	default:
		return false
	}
}

// syncHomeroomTeacherFromUser 已废弃：小组老师在教学端自行担任，不再从用户 classId 同步。
func (h *Handler) syncHomeroomTeacherFromUser(userID, role string, classID *string) {}

type adminCoursePayload struct {
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Cover       *string   `json:"cover"`
	Difficulty  string    `json:"difficulty"`
	Duration    int       `json:"duration"`
	IsActive    *bool     `json:"isActive"` // 是否开课
	ClassID     *string   `json:"classId"`
	ClassIDs    *[]string `json:"classIds"` // 多小组；与 classId 同时传时以 classIds 为准
}

type adminLabPayload struct {
	CourseID        string  `json:"courseId"`
	Type            string  `json:"type"` // lab, video, exam
	Title           string  `json:"title"`
	Description     string  `json:"description"`
	Content         string  `json:"content"`
	Difficulty      string  `json:"difficulty"`
	Order           int     `json:"order"`
	Points          int     `json:"points"`
	TimeLimit       int     `json:"timeLimit"`
	VideoURL        *string `json:"videoUrl"`
	VideoDuration   int     `json:"videoDuration"`
	ServerID        *string `json:"serverId"`
	DockerImage     string  `json:"dockerImage"`
	CPULimit        float64 `json:"cpuLimit"`
	MemoryLimit     int     `json:"memoryLimit"`
	ShellCommand    *string `json:"shellCommand"`
	RestartPolicy   *string `json:"restartPolicy"`
	PortMappings    any     `json:"portMappings"`
	EnvironmentVars any     `json:"environmentVars"`
	VolumeMounts    any     `json:"volumeMounts"`
	JudgeType       *string `json:"judgeType"`
	JudgeScript     *string `json:"judgeScript"`
}

func (h *Handler) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role := userRoleFromCtx(c)
		if role != "ADMIN" && role != "AUTHOR" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
			return
		}
		uid, ok := userIDFromCtx(c)
		if !ok || uid == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
			return
		}
		var row struct {
			MustChangePassword bool `gorm:"column:mustChangePassword"`
		}
		if err := h.db.Model(&model.User{}).Select("mustChangePassword").Where("id = ?", uid).Take(&row).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
			return
		}
		if row.MustChangePassword {
			c.AbortWithStatusJSON(http.StatusPreconditionRequired, gin.H{
				"code":    "password_change_required",
				"message": "请先修改默认管理员密码",
			})
			return
		}
		c.Next()
	}
}

func (h *Handler) AdminGetUsers(c *gin.Context) {
	type userRow struct {
		ID                string  `gorm:"column:id"`
		Username          string  `gorm:"column:username"`
		DisplayName       string  `gorm:"column:displayName"`
		Role              string  `gorm:"column:role"`
		QQNumber          string  `gorm:"column:qqNumber"`
		ClassID           *string `gorm:"column:classId"`
		ClassName         *string `gorm:"column:className"`
		StudyGroupNames   *string `gorm:"column:studyGroupNames"`
		AdvisedGroupNames *string `gorm:"column:advisedGroupNames"`
		CreatedAt         int64   `gorm:"column:createdAt"`
		LastActiveAt      int64   `gorm:"column:lastActiveAt"`
		ContainerCount    int64   `gorm:"column:containerCount"`
		SubmissionCount   int64   `gorm:"column:submissionCount"`
	}

	var rows []userRow
	err := h.db.Table("users u").
		Select(`u.id, u.username, u.displayName, u.role, u.qqNumber, u.classId, c.name as className,
			(SELECT group_concat(c2.name, '、') FROM group_memberships gm JOIN classes c2 ON c2.id = gm.classId WHERE gm.userId = u.id) as studyGroupNames,
			(SELECT group_concat(c3.name, '、') FROM classes c3 WHERE c3.homeroomTeacherId = u.id) as advisedGroupNames,
			cast(u.createdAt as integer) as createdAt, cast(u.lastActiveAt as integer) as lastActiveAt,
			(SELECT COUNT(1) FROM containers ct WHERE ct.userId = u.id) as containerCount,
			(SELECT COUNT(1) FROM submissions s WHERE s.userId = u.id) as submissionCount`).
		Joins("LEFT JOIN classes c ON c.id = u.classId").
		Order("u.createdAt desc").
		Find(&rows).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load users failed"})
		return
	}

	resp := make([]gin.H, 0, len(rows))
	for _, u := range rows {
		resp = append(resp, gin.H{
			"id":                u.ID,
			"username":          u.Username,
			"displayName":       u.DisplayName,
			"role":              u.Role,
			"qqNumber":          u.QQNumber,
			"classId":           u.ClassID,
			"className":         u.ClassName,
			"studyGroupNames":   u.StudyGroupNames,
			"advisedGroupNames": u.AdvisedGroupNames,
			"homeroomClassName": u.AdvisedGroupNames,
			"createdAt":         u.CreatedAt,
			"lastActiveAt":      u.LastActiveAt,
			"_count": gin.H{
				"containers":  u.ContainerCount,
				"submissions": u.SubmissionCount,
			},
		})
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) AdminCreateUser(c *gin.Context) {
	var req adminUserPayload
	if err := c.ShouldBindJSON(&req); err != nil || req.Username == "" || req.DisplayName == "" || req.Password == nil || *req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	username, message := normalizeUsername(req.Username)
	if message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": message})
		return
	}
	displayName, message := normalizeDisplayName(req.DisplayName)
	if message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": message})
		return
	}
	if message := validatePassword(*req.Password); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": message})
		return
	}
	qqNumber, message := normalizeOptionalQQ(req.QQNumber)
	if message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": message})
		return
	}

	actor := userRoleFromCtx(c)
	role := "STUDENT"
	if req.Role != nil && strings.TrimSpace(*req.Role) != "" {
		role = strings.ToUpper(strings.TrimSpace(*req.Role))
		if !validAdminAssignableRole(role) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "无效的角色"})
			return
		}
		if (role == "ADMIN" || role == "AUTHOR") && actor != "AUTHOR" {
			c.JSON(http.StatusForbidden, gin.H{"message": "仅超管可分配管理员或超管角色"})
			return
		}
		if role == "AUTHOR" && displayName != "肖瑞杰" {
			c.JSON(http.StatusForbidden, gin.H{"message": "超管仅能分配给显示名为「肖瑞杰」的用户"})
			return
		}
	}

	var classIDPtr *string
	if role != "STUDENT" {
		if req.ClassID != nil && strings.TrimSpace(*req.ClassID) != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "仅学生可绑定学习小组（老师请在教学端管理）"})
			return
		}
	} else if req.ClassID != nil {
		s := strings.TrimSpace(*req.ClassID)
		if s != "" {
			var cnt int64
			h.db.Model(&model.Class{}).Where("id = ?", s).Count(&cnt)
			if cnt == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "学习小组不存在"})
				return
			}
			classIDPtr = &s
		}
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(*req.Password), 10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Hash password failed"})
		return
	}

	u := model.User{
		ID:           newID(),
		Username:     username,
		DisplayName:  displayName,
		Email:        username + "@sparklab.local",
		Password:     string(hashed),
		Role:         role,
		QQNumber:     qqNumber,
		ClassID:      classIDPtr,
		CreatedAt:    model.Now(),
		UpdatedAt:    model.Now(),
		LastActiveAt: model.Now(),
	}
	if err := h.db.Create(&u).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"message": "Username or QQ number already exists"})
		return
	}

	if u.Role == "STUDENT" && classIDPtr != nil && *classIDPtr != "" {
		gm := model.GroupMembership{
			ID:        newID(),
			UserID:    u.ID,
			ClassID:   *classIDPtr,
			CreatedAt: model.Now(),
		}
		_ = h.db.Create(&gm).Error
	}

	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		_ = h.LogActivity(actorID, "admin_create_user", "user", u.ID, u.DisplayName)
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          u.ID,
		"username":    u.Username,
		"displayName": u.DisplayName,
		"role":        u.Role,
		"qqNumber":    u.QQNumber,
		"classId":     u.ClassID,
		"createdAt":   u.CreatedAt,
	})
}

func (h *Handler) AdminUpdateUser(c *gin.Context) {
	id := c.Param("id")
	var req adminUserPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	var existing model.User
	if err := h.db.Where("id = ?", id).First(&existing).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}

	effectiveDisplay := existing.DisplayName
	if req.DisplayName != "" {
		displayName, message := normalizeDisplayName(req.DisplayName)
		if message != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": message})
			return
		}
		effectiveDisplay = displayName
	}
	actor := userRoleFromCtx(c)
	effectiveRole := existing.Role
	if req.Role != nil && strings.TrimSpace(*req.Role) != "" {
		r := strings.ToUpper(strings.TrimSpace(*req.Role))
		if !validAdminAssignableRole(r) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "无效的角色"})
			return
		}
		if (r == "ADMIN" || r == "AUTHOR") && actor != "AUTHOR" {
			c.JSON(http.StatusForbidden, gin.H{"message": "仅超管可分配管理员或超管角色"})
			return
		}
		effectiveRole = r
	}
	if effectiveRole == "AUTHOR" && effectiveDisplay != "肖瑞杰" {
		c.JSON(http.StatusForbidden, gin.H{"message": "超管仅能分配给显示名为「肖瑞杰」的用户"})
		return
	}

	updates := map[string]any{"updatedAt": model.Now()}
	if req.Username != "" {
		username, message := normalizeUsername(req.Username)
		if message != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": message})
			return
		}
		updates["username"] = username
		updates["email"] = username + "@sparklab.local"
	}
	if req.DisplayName != "" {
		updates["displayName"] = effectiveDisplay
	}
	if req.Role != nil && *req.Role != "" {
		updates["role"] = effectiveRole
	}
	if req.QQNumber != nil {
		qqNumber, message := normalizeOptionalQQ(req.QQNumber)
		if message != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": message})
			return
		}
		updates["qqNumber"] = qqNumber
	}
	if effectiveRole != "STUDENT" {
		if effectiveRole == "TEACHER" && req.ClassID != nil && strings.TrimSpace(*req.ClassID) != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "老师学习小组请在教学端管理，勿在此绑定"})
			return
		}
		if effectiveRole != "TEACHER" {
			updates["classId"] = nil
			if req.ClassID != nil && strings.TrimSpace(*req.ClassID) != "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "仅学生可绑定学习小组"})
				return
			}
		}
	} else if req.ClassID != nil {
		s := strings.TrimSpace(*req.ClassID)
		if s == "" {
			updates["classId"] = nil
		} else {
			var cnt int64
			h.db.Model(&model.Class{}).Where("id = ?", s).Count(&cnt)
			if cnt == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "学习小组不存在"})
				return
			}
			updates["classId"] = s
		}
	}
	if req.Password != nil && *req.Password != "" {
		if message := validatePassword(*req.Password); message != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": message})
			return
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(*req.Password), 10)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Hash password failed"})
			return
		}
		updates["password"] = string(hashed)
	}

	if err := h.db.Model(&model.User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"message": "Update user failed"})
		return
	}

	var u model.User
	if err := h.db.Where("id = ?", id).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}

	if effectiveRole == "STUDENT" && req.ClassID != nil {
		_ = h.db.Where("userId = ?", id).Delete(&model.GroupMembership{}).Error
		if u.ClassID != nil && strings.TrimSpace(*u.ClassID) != "" {
			cid := strings.TrimSpace(*u.ClassID)
			gm := model.GroupMembership{
				ID:        newID(),
				UserID:    id,
				ClassID:   cid,
				CreatedAt: model.Now(),
			}
			_ = h.db.Create(&gm).Error
		}
	}

	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		_ = h.LogActivity(actorID, "admin_update_user", "user", u.ID, u.DisplayName)
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          u.ID,
		"username":    u.Username,
		"displayName": u.DisplayName,
		"role":        u.Role,
		"qqNumber":    u.QQNumber,
		"classId":     u.ClassID,
		"createdAt":   u.CreatedAt,
	})
}

func (h *Handler) AdminDeleteUser(c *gin.Context) {
	id := c.Param("id")
	actor := userRoleFromCtx(c)
	actorID, _ := userIDFromCtx(c)
	if actorID != "" && id == actorID {
		c.JSON(http.StatusForbidden, gin.H{"message": "不能删除当前登录账号"})
		return
	}
	var u model.User
	if err := h.db.Where("id = ?", id).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	if u.Role == "AUTHOR" {
		c.JSON(http.StatusForbidden, gin.H{"message": "不能删除超管账号"})
		return
	}
	if u.Role == "ADMIN" && actor != "AUTHOR" {
		c.JSON(http.StatusForbidden, gin.H{"message": "仅超管可删除管理员账号"})
		return
	}
	_ = h.db.Exec(`UPDATE classes SET homeroomTeacherId = NULL WHERE homeroomTeacherId = ?`, id).Error
	if err := h.db.Delete(&model.User{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Delete user failed"})
		return
	}
	if actorID != "" {
		_ = h.LogActivity(actorID, "admin_delete_user", "user", u.ID, u.DisplayName)
	}
	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}

func (h *Handler) AdminCreateCourse(c *gin.Context) {
	var req adminCoursePayload
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" || req.Description == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	isActive := true // 默认开课
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	if req.Difficulty == "" {
		req.Difficulty = "beginner"
	}

	var classIDPtr *string
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
	for _, gid := range groupIDs {
		var cnt int64
		h.db.Model(&model.Class{}).Where("id = ?", gid).Count(&cnt)
		if cnt == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "学习小组不存在: " + gid})
			return
		}
	}
	if len(groupIDs) > 0 {
		sorted := append([]string(nil), groupIDs...)
		sort.Strings(sorted)
		classIDPtr = &sorted[0]
	}

	course := model.Course{
		ID:          newID(),
		Title:       req.Title,
		Description: req.Description,
		Cover:       req.Cover,
		Difficulty:  req.Difficulty,
		Duration:    req.Duration,
		IsActive:    isActive,
		ClassID:     classIDPtr,
		CreatedAt:   model.Now(),
		UpdatedAt:   model.Now(),
	}
	if err := h.db.Create(&course).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Create course failed"})
		return
	}
	if len(groupIDs) > 0 {
		if err := h.replaceCourseClassLinks(course.ID, groupIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "关联学习小组失败"})
			return
		}
	}
	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		_ = h.LogActivity(actorID, "admin_create_course", "course", course.ID, course.Title)
	}
	c.JSON(http.StatusOK, course)
}

func (h *Handler) AdminUpdateCourse(c *gin.Context) {
	id := c.Param("id")
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
	if req.ClassID != nil {
		s := strings.TrimSpace(*req.ClassID)
		if s == "" {
			updates["classId"] = nil
		} else {
			var cnt int64
			h.db.Model(&model.Class{}).Where("id = ?", s).Count(&cnt)
			if cnt == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "班级不存在"})
				return
			}
			updates["classId"] = s
		}
	}

	if err := h.db.Model(&model.Course{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Update course failed"})
		return
	}

	if req.ClassIDs != nil {
		groupIDs := dedupeTrimmedStrings(*req.ClassIDs)
		for _, gid := range groupIDs {
			var cnt int64
			h.db.Model(&model.Class{}).Where("id = ?", gid).Count(&cnt)
			if cnt == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "学习小组不存在: " + gid})
				return
			}
		}
		if err := h.replaceCourseClassLinks(id, groupIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "更新课程小组关联失败"})
			return
		}
	} else if req.ClassID != nil {
		s := strings.TrimSpace(*req.ClassID)
		if s == "" {
			if err := h.replaceCourseClassLinks(id, nil); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "更新课程小组关联失败"})
				return
			}
		} else {
			if err := h.replaceCourseClassLinks(id, []string{s}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "更新课程小组关联失败"})
				return
			}
		}
	}

	var course model.Course
	h.db.Where("id = ?", id).First(&course)
	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		_ = h.LogActivity(actorID, "admin_update_course", "course", course.ID, course.Title)
	}
	c.JSON(http.StatusOK, course)
}

func (h *Handler) AdminDeleteCourse(c *gin.Context) {
	// 此功能已废弃，课程不再支持删除
	// 请使用停课功能（PATCH /admin/courses/:id/toggle-active）
	c.JSON(http.StatusBadRequest, gin.H{"message": "Course deletion is not supported. Use toggle-active instead."})
}

// AdminToggleCourseActive 开课/停课
func (h *Handler) AdminToggleCourseActive(c *gin.Context) {
	id := c.Param("id")

	var course model.Course
	if err := h.db.Where("id = ?", id).First(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}

	// 切换开课状态
	newStatus := !course.IsActive
	if err := h.db.Model(&model.Course{}).
		Where("id = ?", id).
		Update("isActive", newStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Toggle course status failed"})
		return
	}

	statusText := "stopped"
	if newStatus {
		statusText = "activated"
	}

	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		action := "admin_deactivate_course"
		if newStatus {
			action = "admin_activate_course"
		}
		_ = h.LogActivity(actorID, action, "course", course.ID, course.Title)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Course " + statusText + " successfully",
		"isActive": newStatus,
	})
}

func toJSONStringPtr(v any) *string {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return nil
	}
	if string(b) == "[]" {
		return nil
	}
	s := string(b)
	return &s
}

func newLabFromAdminPayload(req *adminLabPayload) model.Lab {
	if req.VideoURL != nil {
		println("[newLabFromAdminPayload] VideoURL:", *req.VideoURL)
	} else {
		println("[newLabFromAdminPayload] VideoURL is nil")
	}
	println("[newLabFromAdminPayload] VideoDuration:", req.VideoDuration)

	labType := req.Type
	if labType == "" {
		labType = "lab"
	}
	difficulty := req.Difficulty
	if difficulty == "" {
		difficulty = "beginner"
	}
	timeLimit := req.TimeLimit
	if timeLimit <= 0 {
		timeLimit = 60
	}
	points := req.Points
	if points <= 0 {
		points = 100
	}
	order := req.Order
	if order <= 0 {
		order = 1
	}
	dockerImage := req.DockerImage
	if dockerImage == "" {
		dockerImage = "ubuntu:22.04"
	}
	cpuLimit := req.CPULimit
	if cpuLimit <= 0 {
		cpuLimit = 1.0
	}
	memoryLimit := req.MemoryLimit
	if memoryLimit <= 0 {
		memoryLimit = 512
	}
	shellCommand := "/bin/bash"
	if req.ShellCommand != nil && *req.ShellCommand != "" {
		shellCommand = *req.ShellCommand
	}
	restartPolicy := "unless-stopped"
	if req.RestartPolicy != nil && *req.RestartPolicy != "" {
		restartPolicy = *req.RestartPolicy
	}
	judgeType := "manual"
	if req.JudgeType != nil && *req.JudgeType != "" {
		judgeType = *req.JudgeType
	}

	return model.Lab{
		ID:              newID(),
		CourseID:        req.CourseID,
		Type:            labType,
		Title:           req.Title,
		Description:     req.Description,
		Content:         req.Content,
		Difficulty:      difficulty,
		Order:           order,
		Points:          points,
		TimeLimit:       timeLimit,
		VideoURL:        req.VideoURL,
		VideoDuration:   req.VideoDuration,
		ServerID:        req.ServerID,
		DockerImage:     dockerImage,
		CPULimit:        cpuLimit,
		MemoryLimit:     memoryLimit,
		ShellCmd:        shellCommand,
		PortMappings:    toJSONStringPtr(req.PortMappings),
		EnvironmentVars: toJSONStringPtr(req.EnvironmentVars),
		VolumeMounts:    toJSONStringPtr(req.VolumeMounts),
		RestartPolicy:   restartPolicy,
		JudgeType:       judgeType,
		JudgeScript:     req.JudgeScript,
		CreatedAt:       model.Now(),
		UpdatedAt:       model.Now(),
	}
}

func (h *Handler) AdminCreateLab(c *gin.Context) {
	var req adminLabPayload
	if err := c.ShouldBindJSON(&req); err != nil || req.CourseID == "" || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	lab := newLabFromAdminPayload(&req)
	if err := h.db.Create(&lab).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Create lab failed"})
		return
	}
	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		_ = h.LogActivity(actorID, "admin_create_lab", "lab", lab.ID, lab.Title)
	}
	c.JSON(http.StatusOK, lab)
}

func (h *Handler) AdminUpdateLab(c *gin.Context) {
	id := c.Param("id")
	var req adminLabPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	// 调试日志
	if req.VideoURL != nil {
		println("[AdminUpdateLab] VideoURL:", *req.VideoURL)
	} else {
		println("[AdminUpdateLab] VideoURL is nil")
	}
	println("[AdminUpdateLab] VideoDuration:", req.VideoDuration)

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
	// 视频字段
	if req.VideoURL != nil && *req.VideoURL != "" {
		updates["videoUrl"] = *req.VideoURL
	}
	if req.VideoDuration > 0 {
		updates["videoDuration"] = req.VideoDuration
	}
	// 实验字段
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

	updates["updatedAt"] = model.Now()

	if err := h.db.Model(&model.Lab{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Update lab failed"})
		return
	}

	var lab model.Lab
	h.db.Where("id = ?", id).First(&lab)
	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		_ = h.LogActivity(actorID, "admin_update_lab", "lab", lab.ID, lab.Title)
	}
	c.JSON(http.StatusOK, lab)
}

func (h *Handler) AdminGetLab(c *gin.Context) {
	id := c.Param("id")

	var lab model.Lab
	if err := h.db.Where("id = ?", id).First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
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

func (h *Handler) AdminDeleteLab(c *gin.Context) {
	// 此功能已废弃，实验不再支持删除
	// 实验的可见性由课程的开课状态控制
	c.JSON(http.StatusBadRequest, gin.H{"message": "Lab deletion is not supported. Labs are controlled by course active status."})
}

func (h *Handler) AdminGetContainers(c *gin.Context) {
	type row struct {
		ID          string  `gorm:"column:id"`
		UserID      string  `gorm:"column:userId"`
		LabID       string  `gorm:"column:labId"`
		ServerID    string  `gorm:"column:serverId"`
		ContainerID string  `gorm:"column:containerId"`
		Status      string  `gorm:"column:status"`
		CreatedAt   int64   `gorm:"column:createdAt"`
		Username    *string `gorm:"column:username"`
		DisplayName *string `gorm:"column:displayName"`
		LabTitle    *string `gorm:"column:labTitle"`
	}

	var rows []row
	err := h.db.Table("containers c").
		Select("c.id, c.userId, c.labId, c.serverId, c.containerId, c.status, strftime('%s', c.createdAt) as createdAt, u.username as username, u.displayName as displayName, l.title as labTitle").
		Joins("LEFT JOIN users u ON u.id = c.userId").
		Joins("LEFT JOIN labs l ON l.id = c.labId").
		Order("c.createdAt desc").
		Find(&rows).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load containers failed"})
		return
	}

	resp := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		resp = append(resp, gin.H{
			"id":          r.ID,
			"userId":      r.UserID,
			"labId":       r.LabID,
			"serverId":    r.ServerID,
			"containerId": r.ContainerID,
			"status":      r.Status,
			"createdAt":   r.CreatedAt,
			"user": gin.H{
				"username":    r.Username,
				"displayName": r.DisplayName,
			},
			"lab": gin.H{
				"title": r.LabTitle,
			},
		})
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) AdminForceStopContainer(c *gin.Context) {
	id := c.Param("id")
	var ct model.Container
	if err := h.db.Where("id = ?", id).First(&ct).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Container not found"})
		return
	}

	dockerID := strings.TrimSpace(ct.ContainerID)
	if dockerID != "" && ct.Status != "stopped" {
		resp, err := h.dockerRequest(nil, http.MethodPost, "/containers/"+url.PathEscape(dockerID)+"/stop?t=5", nil, nil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to stop Docker container: " + err.Error()})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotModified && resp.StatusCode != http.StatusNotFound {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to stop Docker container: " + readDockerError(resp)})
			return
		}
	}

	now := time.Now()
	if err := h.db.Model(&model.Container{}).Where("id = ?", id).Updates(map[string]any{
		"status":     "stopped",
		"stoppedAt":  now,
		"autoStopAt": nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Force stop failed"})
		return
	}
	if actorID, ok := userIDFromCtx(c); ok && actorID != "" {
		targetName := ct.ContainerID
		if strings.TrimSpace(targetName) == "" {
			targetName = ct.ID
		}
		_ = h.LogActivity(actorID, "admin_force_stop_container", "container", ct.ID, targetName)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Container force stopped"})
}

func (h *Handler) AdminStats(c *gin.Context) {
	var totalUsers, totalCourses, totalLabs, activeContainers, totalSubmissions, totalContainers int64
	h.db.Table("users").Count(&totalUsers)
	h.db.Table("courses").Count(&totalCourses)
	h.db.Table("labs").Count(&totalLabs)
	h.db.Table("containers").Where("status = ?", "running").Count(&activeContainers)
	h.db.Table("containers").Count(&totalContainers)
	h.db.Table("submissions").Count(&totalSubmissions)

	type statusRow struct {
		Status string `gorm:"column:status" json:"status"`
		Count  int64  `gorm:"column:count" json:"_count"`
	}
	var statusRows []statusRow
	h.db.Table("containers").Select("status, count(1) as count").Group("status").Find(&statusRows)

	type userRow struct {
		ID           string  `gorm:"column:id"`
		Username     string  `gorm:"column:username"`
		DisplayName  string  `gorm:"column:displayName"`
		QQNumber     *string `gorm:"column:qqNumber"`
		Role         string  `gorm:"column:role"`
		LastActiveAt int64   `gorm:"column:lastActiveAt"`
	}
	var recentUsers []userRow
	// 管理首页「最近活跃」展示学生（按 lastActiveAt）
	h.db.Table("users").
		Select("id, username, displayName, qqNumber, role, cast(lastActiveAt as integer) as lastActiveAt").
		Where("role = ?", "STUDENT").
		Order("lastActiveAt desc").
		Limit(5).
		Find(&recentUsers)

	usersResp := make([]gin.H, 0, len(recentUsers))
	for _, u := range recentUsers {
		var cc, sc int64
		h.db.Table("containers").Where("userId = ?", u.ID).Count(&cc)
		h.db.Table("submissions").Where("userId = ?", u.ID).Count(&sc)
		usersResp = append(usersResp, gin.H{
			"id":           u.ID,
			"username":     u.Username,
			"displayName":  u.DisplayName,
			"qqNumber":     u.QQNumber,
			"role":         u.Role,
			"lastActiveAt": u.LastActiveAt,
			"_count": gin.H{
				"containers":  cc,
				"submissions": sc,
			},
		})
	}

	type containerRow struct {
		ID          string  `gorm:"column:id"`
		Status      string  `gorm:"column:status"`
		CreatedAt   int64   `gorm:"column:createdAt"`
		Username    *string `gorm:"column:username"`
		Display     *string `gorm:"column:displayName"`
		LabTitle    *string `gorm:"column:labTitle"`
		StoppedAt   *int64  `gorm:"column:stoppedAt"`
		StartedAt   *int64  `gorm:"column:startedAt"`
		ServerID    *string `gorm:"column:serverId"`
		ContainerID string  `gorm:"column:containerId"`
	}
	var recentContainers []containerRow
	h.db.Table("containers c").
		Select("c.id, c.status, strftime('%s', c.createdAt) as createdAt, strftime('%s', c.stoppedAt) as stoppedAt, strftime('%s', c.startedAt) as startedAt, c.serverId, c.containerId, u.username as username, u.displayName as displayName, l.title as labTitle").
		Joins("LEFT JOIN users u ON u.id = c.userId").
		Joins("LEFT JOIN labs l ON l.id = c.labId").
		Order("c.createdAt desc").
		Limit(5).
		Find(&recentContainers)

	containersResp := make([]gin.H, 0, len(recentContainers))
	for _, rc := range recentContainers {
		containersResp = append(containersResp, gin.H{
			"id":          rc.ID,
			"containerId": rc.ContainerID,
			"status":      rc.Status,
			"createdAt":   rc.CreatedAt,
			"user": gin.H{
				"username":    rc.Username,
				"displayName": rc.Display,
			},
			"lab": gin.H{
				"title": rc.LabTitle,
			},
		})
	}

	type courseRow struct {
		ID        string `gorm:"column:id"`
		Title     string `gorm:"column:title"`
		CreatedAt int64  `gorm:"column:createdAt"`
	}
	var topCourses []courseRow
	h.db.Table("courses").
		Select("id, title, cast(createdAt as integer) as createdAt").
		Order("createdAt desc").
		Limit(5).
		Find(&topCourses)

	courseResp := make([]gin.H, 0, len(topCourses))
	for _, cc := range topCourses {
		var ec, lc int64
		h.db.Table("enrollments").Where("courseId = ?", cc.ID).Count(&ec)
		h.db.Table("labs").Where("courseId = ?", cc.ID).Count(&lc)
		courseResp = append(courseResp, gin.H{
			"id":    cc.ID,
			"title": cc.Title,
			"_count": gin.H{
				"enrollments": ec,
				"labs":        lc,
			},
		})
	}

	type auditRow struct {
		ID               string    `gorm:"column:id"`
		Action           string    `gorm:"column:action"`
		TargetType       *string   `gorm:"column:targetType"`
		TargetID         *string   `gorm:"column:targetId"`
		TargetName       *string   `gorm:"column:targetName"`
		CreatedAt        time.Time `gorm:"column:createdAt"`
		ActorID          string    `gorm:"column:actorId"`
		ActorUsername    *string   `gorm:"column:actorUsername"`
		ActorDisplayName *string   `gorm:"column:actorDisplayName"`
	}
	var auditRows []auditRow
	auditActions := []string{
		"admin_create_user",
		"admin_update_user",
		"admin_delete_user",
		"admin_create_course",
		"admin_update_course",
		"admin_activate_course",
		"admin_deactivate_course",
		"admin_create_lab",
		"admin_update_lab",
		"admin_force_stop_container",
		"grade_submission",
	}
	_ = h.db.Table("activity_logs al").
		Select("al.id, al.action, al.targetType, al.targetId, al.targetName, al.createdAt, al.userId as actorId, u.username as actorUsername, u.displayName as actorDisplayName").
		Joins("LEFT JOIN users u ON u.id = al.userId").
		Where("al.action IN ?", auditActions).
		Order("al.createdAt desc").
		Limit(8).
		Find(&auditRows).Error
	auditResp := make([]gin.H, 0, len(auditRows))
	for _, row := range auditRows {
		auditResp = append(auditResp, gin.H{
			"id":         row.ID,
			"action":     row.Action,
			"targetType": row.TargetType,
			"targetId":   row.TargetID,
			"targetName": row.TargetName,
			"createdAt":  row.CreatedAt,
			"actor": gin.H{
				"id":          row.ActorID,
				"username":    row.ActorUsername,
				"displayName": row.ActorDisplayName,
			},
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"totalUsers":         totalUsers,
		"totalCourses":       totalCourses,
		"totalLabs":          totalLabs,
		"activeContainers":   activeContainers,
		"totalContainers":    totalContainers,
		"totalSubmissions":   totalSubmissions,
		"recentUsers":        usersResp,
		"recentContainers":   containersResp,
		"courseStats":        courseResp,
		"recentAuditLogs":    auditResp,
		"containersByStatus": statusRows,
	})
}

func (h *Handler) AdminGetAvailablePort(c *gin.Context) {
	var containers []model.Container
	h.db.Find(&containers)

	used := map[int]bool{}
	for _, ct := range containers {
		if ct.PortMappings == nil {
			continue
		}
		var arr []map[string]any
		if err := json.Unmarshal([]byte(*ct.PortMappings), &arr); err != nil {
			continue
		}
		for _, p := range arr {
			if hp, ok := p["hostPort"].(float64); ok {
				used[int(hp)] = true
			}
		}
	}

	cand := make([]int, 0, 512)
	for p := 10000; p <= 50000; p++ {
		if !used[p] {
			cand = append(cand, p)
		}
	}
	if len(cand) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "No available ports in range"})
		return
	}

	rand.Seed(time.Now().UnixNano())
	c.JSON(http.StatusOK, gin.H{"port": cand[rand.Intn(len(cand))]})
}
