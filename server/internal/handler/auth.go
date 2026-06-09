package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sparklab/server/internal/auth"
	"sparklab/server/internal/model"
	"sparklab/server/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type authUserRecord struct {
	ID          string  `gorm:"column:id"`
	Username    string  `gorm:"column:username"`
	DisplayName string  `gorm:"column:displayName"`
	Email       string  `gorm:"column:email"`
	Password    string  `gorm:"column:password"`
	Role        string  `gorm:"column:role"`
	Avatar      *string `gorm:"column:avatar"`
	QQNumber    *string `gorm:"column:qqNumber"`
	ClassID     *string `gorm:"column:classId"`
}

type registerReq struct {
	Username    string   `json:"username"`
	DisplayName string   `json:"displayName"`
	Password    string   `json:"password"`
	QQNumber    *string  `json:"qqNumber"`
	Role        string   `json:"role"`     // 公开注册仅允许 STUDENT；教师由管理员创建
	ClassID     *string  `json:"classId"`  // 学生可选，加入单个学习小组
	ClassIDs    []string `json:"classIds"` // 学生可选，加入多个
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type updateProfileReq struct {
	Username    *string `json:"username"`
	DisplayName *string `json:"displayName"`
	QQNumber    *string `json:"qqNumber"`
}

func (h *Handler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "Invalid payload")
		return
	}

	if req.Username == "" || req.DisplayName == "" || req.Password == "" {
		util.BadRequest(c, "username, displayName and password are required")
		return
	}

	var existing struct {
		ID string `gorm:"column:id"`
	}
	err := h.db.Table("users").Select("id").Where("username = ?", req.Username).Take(&existing).Error
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"message": "Username or QQ number already exists"})
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		util.Error(c, http.StatusInternalServerError, "Check username failed")
		return
	}

	if req.QQNumber != nil && *req.QQNumber != "" {
		err = h.db.Table("users").Select("id").Where("qqNumber = ?", *req.QQNumber).Take(&existing).Error
		if err == nil {
			c.JSON(http.StatusConflict, gin.H{"message": "Username or QQ number already exists"})
			return
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			util.Error(c, http.StatusInternalServerError, "Check QQ number failed")
			return
		}
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "Hash password failed")
		return
	}

	role := strings.TrimSpace(strings.ToUpper(req.Role))
	if role == "" {
		role = "STUDENT"
	}
	if role != "STUDENT" {
		util.BadRequest(c, "公开注册仅支持学生账号，教师账号请联系管理员创建")
		return
	}

	seen := make(map[string]struct{})
	var groupIDs []string
	addGroup := func(raw string) bool {
		s := strings.TrimSpace(raw)
		if s == "" {
			return true
		}
		if _, dup := seen[s]; dup {
			return true
		}
		var cnt int64
		h.db.Model(&model.Class{}).Where("id = ?", s).Count(&cnt)
		if cnt == 0 {
			util.BadRequest(c, "学习小组不存在")
			return false
		}
		seen[s] = struct{}{}
		groupIDs = append(groupIDs, s)
		return true
	}
	if role == "STUDENT" {
		if req.ClassID != nil {
			if !addGroup(*req.ClassID) {
				return
			}
		}
		for _, x := range req.ClassIDs {
			if !addGroup(x) {
				return
			}
		}
	}

	var classIDPtr *string
	if role == "STUDENT" && len(groupIDs) > 0 {
		classIDPtr = &groupIDs[0]
	}

	u := model.User{
		ID:           newID(),
		Username:     req.Username,
		DisplayName:  req.DisplayName,
		Email:        req.Username + "@sparklab.local",
		Password:     string(hashed),
		Role:         role,
		QQNumber:     req.QQNumber,
		ClassID:      classIDPtr,
		CreatedAt:    model.Now(),
		UpdatedAt:    model.Now(),
		LastActiveAt: model.Now(),
	}

	if err := h.db.Create(&u).Error; err != nil {
		util.Error(c, http.StatusInternalServerError, "Create user failed")
		return
	}

	for _, gid := range groupIDs {
		gm := model.GroupMembership{
			ID:        newID(),
			UserID:    u.ID,
			ClassID:   gid,
			CreatedAt: model.Now(),
		}
		_ = h.db.Create(&gm).Error
	}

	c.JSON(http.StatusCreated, h.userProfileMapFromModel(u))
}

func (h *Handler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "Invalid payload")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		util.BadRequest(c, "username and password are required")
		return
	}

	limitKeys := loginRateLimitKeys(c, req.Username)
	if retryAfter, ok := h.authLimiter.allow(limitKeys); !ok {
		c.Header("Retry-After", strconv.Itoa(int(retryAfter.Round(time.Second).Seconds())))
		c.JSON(http.StatusTooManyRequests, gin.H{"message": "登录尝试过多，请稍后再试"})
		return
	}

	var u authUserRecord
	err := h.db.Table("users").
		Select("id, username, displayName, email, password, role, avatar, qqNumber, classId").
		Where("username = ? OR qqNumber = ?", req.Username, req.Username).
		Take(&u).Error
	if err != nil {
		h.authLimiter.recordFailure(limitKeys)
		util.Unauthorized(c, "Invalid credentials")
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(req.Password)) != nil {
		h.authLimiter.recordFailure(limitKeys)
		util.Unauthorized(c, "Invalid credentials")
		return
	}

	h.authLimiter.reset(limitKeys)

	token, err := auth.SignToken(h.cfg.JWTSecret, u.ID, u.Username, u.Role, h.cfg.JWTExpires)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "Sign token failed")
		return
	}

	h.db.Model(&model.User{}).Where("id = ?", u.ID).Update("lastActiveAt", model.Now())

	h.setAuthCookie(c, token, 7*24*3600)
	c.JSON(http.StatusOK, gin.H{
		"access_token": token,
		"user":         h.userProfileMapFromRecord(u),
	})
}

func (h *Handler) Logout(c *gin.Context) {
	h.setAuthCookie(c, "", -1)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func (h *Handler) setAuthCookie(c *gin.Context, value string, maxAge int) {
	c.SetSameSite(h.cfg.CookieSameSite)
	c.SetCookie("access_token", value, maxAge, "/", "", h.cfg.CookieSecure, true)
}

func (h *Handler) GetProfile(c *gin.Context) {
	token, ok := authTokenFromRequest(c)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"authenticated": false, "user": nil})
		return
	}

	claims, err := auth.ParseToken(token, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"authenticated": false, "user": nil})
		return
	}

	var u authUserRecord
	if err := h.db.Table("users").
		Select("id, username, displayName, email, password, role, avatar, qqNumber, classId").
		Where("id = ?", claims.Subject).
		Take(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"authenticated": false, "user": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"authenticated": true, "user": h.userProfileMapFromRecord(u)})
}

func (h *Handler) CheckAuth(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	var u authUserRecord
	if err := h.db.Table("users").
		Select("id, username, displayName, email, password, role, avatar, qqNumber, classId").
		Where("id = ?", uid).
		Take(&u).Error; err != nil {
		util.Unauthorized(c, "Unauthorized")
		return
	}
	c.JSON(http.StatusOK, gin.H{"authenticated": true, "user": h.userProfileMapFromRecord(u)})
}

func (h *Handler) UpdateProfile(c *gin.Context) {
	uid, _ := userIDFromCtx(c)

	var req updateProfileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "Invalid payload")
		return
	}

	updates := map[string]any{"updatedAt": model.Now()}
	if req.Username != nil {
		updates["username"] = *req.Username
	}
	if req.DisplayName != nil {
		updates["displayName"] = *req.DisplayName
	}
	if req.QQNumber != nil {
		updates["qqNumber"] = *req.QQNumber
	}

	if err := h.db.Model(&model.User{}).Where("id = ?", uid).Updates(updates).Error; err != nil {
		if err == gorm.ErrDuplicatedKey {
			c.JSON(http.StatusConflict, gin.H{"message": "Username already exists"})
			return
		}
		util.Error(c, http.StatusInternalServerError, "Update failed")
		return
	}

	var u authUserRecord
	h.db.Table("users").
		Select("id, username, displayName, email, password, role, avatar, qqNumber, classId").
		Where("id = ?", uid).
		Take(&u)
	c.JSON(http.StatusOK, h.userProfileMapFromRecord(u))
}

func (h *Handler) GetStats(c *gin.Context) {
	uid, _ := userIDFromCtx(c)

	var enrolledCourses int64
	h.db.Model(&model.Enrollment{}).Where("userId = ?", uid).Count(&enrolledCourses)
	println("[GetStats] User ID:", uid)
	println("[GetStats] Enrolled courses:", enrolledCourses)

	var completedLabs int64
	h.db.Model(&model.Submission{}).Where("userId = ? AND status = ?", uid, "passed").Count(&completedLabs)

	var passedSubs []model.Submission
	h.db.Where("userId = ? AND status = ?", uid, "passed").Find(&passedSubs)
	totalScore := 0
	for _, s := range passedSubs {
		totalScore += s.Score
	}

	c.JSON(http.StatusOK, gin.H{
		"enrolledCourses": enrolledCourses,
		"completedLabs":   completedLabs,
		"totalScore":      totalScore,
		"studyTime":       0,
	})
}

func (h *Handler) userProfileMapFromRecord(u authUserRecord) gin.H {
	m := gin.H{
		"id": u.ID, "username": u.Username, "displayName": u.DisplayName, "email": u.Email,
		"role": u.Role, "avatar": u.Avatar, "qqNumber": u.QQNumber, "classId": u.ClassID,
	}
	if u.ClassID != nil && *u.ClassID != "" {
		var cl model.Class
		if err := h.db.Select("name").Where("id = ?", *u.ClassID).Take(&cl).Error; err == nil {
			m["className"] = cl.Name
		}
	}
	if u.Role == "STUDENT" {
		var mss []model.GroupMembership
		_ = h.db.Where("userId = ?", u.ID).Find(&mss).Error
		seen := make(map[string]struct{}, len(mss))
		groups := make([]gin.H, 0, len(mss)+1)
		for _, gm := range mss {
			if _, ok := seen[gm.ClassID]; ok {
				continue
			}
			seen[gm.ClassID] = struct{}{}
			var cl model.Class
			nm := gm.ClassID
			if err := h.db.Select("name").Where("id = ?", gm.ClassID).Take(&cl).Error; err == nil {
				nm = cl.Name
			}
			groups = append(groups, gin.H{"id": gm.ClassID, "name": nm})
		}
		if u.ClassID != nil {
			cid := strings.TrimSpace(*u.ClassID)
			if cid != "" {
				if _, ok := seen[cid]; !ok {
					var cl model.Class
					nm := cid
					if err := h.db.Select("name").Where("id = ?", cid).Take(&cl).Error; err == nil {
						nm = cl.Name
					}
					groups = append(groups, gin.H{"id": cid, "name": nm})
				}
			}
		}
		m["studyGroups"] = groups
	}
	if u.Role == "TEACHER" {
		var cls []model.Class
		_ = h.db.Where("homeroomTeacherId = ?", u.ID).Order("createdAt asc").Find(&cls).Error
		adv := make([]gin.H, 0, len(cls))
		for _, cl := range cls {
			adv = append(adv, gin.H{"id": cl.ID, "name": cl.Name})
		}
		m["advisedGroups"] = adv
		if len(cls) > 0 {
			m["homeroomClass"] = gin.H{"id": cls[0].ID, "name": cls[0].Name}
		}
	}
	return m
}

func (h *Handler) userProfileMapFromModel(u model.User) gin.H {
	rec := authUserRecord{
		ID: u.ID, Username: u.Username, DisplayName: u.DisplayName, Email: u.Email,
		Role: u.Role, Avatar: u.Avatar, QQNumber: u.QQNumber, ClassID: u.ClassID,
	}
	return h.userProfileMapFromRecord(rec)
}

type studyGroupIDBody struct {
	ClassID string `json:"classId"`
}

// StudentJoinGroup POST /auth/groups/join
func (h *Handler) StudentJoinGroup(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		util.Unauthorized(c, "Unauthorized")
		return
	}
	if userRoleFromCtx(c) != "STUDENT" {
		c.JSON(http.StatusForbidden, gin.H{"message": "仅学生可加入学习小组"})
		return
	}
	var req studyGroupIDBody
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.ClassID) == "" {
		util.BadRequest(c, "请提供 classId")
		return
	}
	gid := strings.TrimSpace(req.ClassID)
	var cnt int64
	h.db.Model(&model.Class{}).Where("id = ?", gid).Count(&cnt)
	if cnt == 0 {
		util.BadRequest(c, "学习小组不存在")
		return
	}
	var n int64
	h.db.Model(&model.GroupMembership{}).Where("userId = ? AND classId = ?", uid, gid).Count(&n)
	if n > 0 {
		c.JSON(http.StatusOK, gin.H{"message": "已在该小组"})
		return
	}
	gm := model.GroupMembership{
		ID:        newID(),
		UserID:    uid,
		ClassID:   gid,
		CreatedAt: model.Now(),
	}
	if err := h.db.Create(&gm).Error; err != nil {
		util.Error(c, http.StatusInternalServerError, "加入失败")
		return
	}
	var u model.User
	if err := h.db.Select("classId").Where("id = ?", uid).Take(&u).Error; err == nil && (u.ClassID == nil || strings.TrimSpace(*u.ClassID) == "") {
		_ = h.db.Model(&model.User{}).Where("id = ?", uid).Updates(map[string]any{"classId": gid, "updatedAt": model.Now()}).Error
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// StudentLeaveGroup POST /auth/groups/leave
func (h *Handler) StudentLeaveGroup(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		util.Unauthorized(c, "Unauthorized")
		return
	}
	if userRoleFromCtx(c) != "STUDENT" {
		c.JSON(http.StatusForbidden, gin.H{"message": "仅学生可退出学习小组"})
		return
	}
	var req studyGroupIDBody
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.ClassID) == "" {
		util.BadRequest(c, "请提供 classId")
		return
	}
	gid := strings.TrimSpace(req.ClassID)
	_ = h.db.Where("userId = ? AND classId = ?", uid, gid).Delete(&model.GroupMembership{}).Error

	var u model.User
	if err := h.db.Select("classId").Where("id = ?", uid).Take(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
		return
	}
	if u.ClassID == nil || strings.TrimSpace(*u.ClassID) != gid {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
		return
	}
	var nextIDs []string
	_ = h.db.Model(&model.GroupMembership{}).Where("userId = ?", uid).Limit(1).Pluck("classId", &nextIDs)
	updates := map[string]any{"updatedAt": model.Now()}
	if len(nextIDs) == 0 || strings.TrimSpace(nextIDs[0]) == "" {
		updates["classId"] = nil
	} else {
		updates["classId"] = strings.TrimSpace(nextIDs[0])
	}
	_ = h.db.Model(&model.User{}).Where("id = ?", uid).Updates(updates).Error
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}
