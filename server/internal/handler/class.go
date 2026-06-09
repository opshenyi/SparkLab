package handler

import (
	"net/http"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *Handler) countGroupStudents(groupID string) int64 {
	type cntRow struct {
		N int64 `gorm:"column:n"`
	}
	var r cntRow
	q := `
SELECT COUNT(DISTINCT u.id) AS n FROM users u
WHERE u.role = 'STUDENT' AND (
  u.classId = ? OR EXISTS (
    SELECT 1 FROM group_memberships gm WHERE gm.userId = u.id AND gm.classId = ?
  )
)`
	_ = h.db.Raw(q, groupID, groupID).Scan(&r).Error
	return r.N
}

func (h *Handler) groupToPublicItem(cl model.Class, memberCount int64) gin.H {
	item := gin.H{
		"id":                  cl.ID,
		"name":                cl.Name,
		"memberCount":         memberCount,
		"groupAdvisorId":      cl.HomeroomTeacherID,
		"groupAdvisorName":    nil,
		"creatorTeacherId":    cl.CreatorTeacherID,
		"homeroomTeacherId":   cl.HomeroomTeacherID,
		"homeroomTeacherName": nil,
	}
	if cl.HomeroomTeacherID != nil && *cl.HomeroomTeacherID != "" {
		var u model.User
		if err := h.db.Select("displayName").Where("id = ?", *cl.HomeroomTeacherID).Take(&u).Error; err == nil {
			item["groupAdvisorName"] = u.DisplayName
			item["homeroomTeacherName"] = u.DisplayName
		}
	}
	return item
}

func (h *Handler) PublicListClasses(c *gin.Context) {
	var classes []model.Class
	if err := h.db.Order("name asc").Find(&classes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载学习小组失败"})
		return
	}
	out := make([]gin.H, 0, len(classes))
	for _, cl := range classes {
		n := h.countGroupStudents(cl.ID)
		out = append(out, h.groupToPublicItem(cl, n))
	}
	c.JSON(http.StatusOK, out)
}

type teacherGroupPayload struct {
	Name           string `json:"name"`
	ClaimAdvisor   bool   `json:"claimAdvisor"`
	ReleaseAdvisor bool   `json:"releaseAdvisor"`
}

func (h *Handler) TeacherListGroups(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}
	var classes []model.Class
	// 教师端列表/筛选：按小组创建时间（老师建立顺序），不按名称排序
	if err := h.db.Order("createdAt asc").Find(&classes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载学习小组失败"})
		return
	}
	out := make([]gin.H, 0, len(classes))
	for _, cl := range classes {
		n := h.countGroupStudents(cl.ID)
		item := h.groupToPublicItem(cl, n)
		item["iAmAdvisor"] = cl.HomeroomTeacherID != nil && *cl.HomeroomTeacherID == uid
		item["iAmCreator"] = cl.CreatorTeacherID != nil && *cl.CreatorTeacherID == uid
		item["canClaimAdvisor"] = (cl.HomeroomTeacherID == nil || strings.TrimSpace(*cl.HomeroomTeacherID) == "") &&
			cl.CreatorTeacherID != nil && *cl.CreatorTeacherID == uid
		out = append(out, item)
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) TeacherCreateGroup(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "学习小组名称不能为空"})
		return
	}
	tid := uid
	cl := model.Class{
		ID:                newID(),
		Name:              strings.TrimSpace(req.Name),
		HomeroomTeacherID: &tid,
		CreatorTeacherID:  &tid,
		CreatedAt:         model.Now(),
		UpdatedAt:         model.Now(),
	}
	if err := h.db.Create(&cl).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "创建学习小组失败"})
		return
	}
	c.JSON(http.StatusOK, h.groupToPublicItem(cl, 0))
}

func (h *Handler) TeacherUpdateGroup(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}
	id := c.Param("id")
	var req teacherGroupPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	if req.ClaimAdvisor && req.ReleaseAdvisor {
		c.JSON(http.StatusBadRequest, gin.H{"message": "不能同时申请担任与不再担任小组老师"})
		return
	}

	var cl model.Class
	if err := h.db.Where("id = ?", id).First(&cl).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "学习小组不存在"})
		return
	}

	isCreator := cl.CreatorTeacherID != nil && *cl.CreatorTeacherID == uid
	isAdvisor := cl.HomeroomTeacherID != nil && *cl.HomeroomTeacherID == uid

	if strings.TrimSpace(req.Name) != "" {
		if !isCreator && !isAdvisor {
			c.JSON(http.StatusForbidden, gin.H{"message": "仅创建者或当前小组老师可修改小组名称"})
			return
		}
		cl.Name = strings.TrimSpace(req.Name)
	}

	if req.ReleaseAdvisor {
		if !isAdvisor {
			c.JSON(http.StatusForbidden, gin.H{"message": "仅当前小组老师可释放该小组"})
			return
		}
		cl.HomeroomTeacherID = nil
	}
	if req.ClaimAdvisor {
		if isAdvisor {
			// 已是当前小组老师时重复认领视为幂等操作，继续保存本次其他允许变更。
		} else if cl.HomeroomTeacherID != nil && strings.TrimSpace(*cl.HomeroomTeacherID) != "" {
			c.JSON(http.StatusConflict, gin.H{"message": "该小组已有小组老师，不能接管"})
			return
		} else if !isCreator {
			c.JSON(http.StatusForbidden, gin.H{"message": "仅创建者可担任自己创建的小组老师"})
			return
		} else {
			cl.HomeroomTeacherID = &uid
		}
	}

	cl.UpdatedAt = model.Now()
	if err := h.db.Save(&cl).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "更新失败"})
		return
	}

	n := h.countGroupStudents(cl.ID)
	c.JSON(http.StatusOK, h.groupToPublicItem(cl, n))
}

func (h *Handler) TeacherDeleteGroup(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}
	id := c.Param("id")
	var cl model.Class
	if err := h.db.Where("id = ?", id).First(&cl).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "学习小组不存在"})
		return
	}
	can := (cl.CreatorTeacherID != nil && *cl.CreatorTeacherID == uid) ||
		(cl.HomeroomTeacherID != nil && *cl.HomeroomTeacherID == uid)
	if !can {
		c.JSON(http.StatusForbidden, gin.H{"message": "仅创建者或小组老师可删除该小组"})
		return
	}
	if h.countGroupStudents(id) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "小组内仍有学生，无法删除"})
		return
	}
	if h.countCoursesReferencingGroup(id) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "小组下仍有课程，请先处理课程后再删除"})
		return
	}
	if err := h.db.Delete(&model.Class{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "删除失败"})
		return
	}
	_ = h.db.Exec(`DELETE FROM group_memberships WHERE classId = ?`, id).Error
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

type teacherAddMemberPayload struct {
	Username string `json:"username"`
	UserID   string `json:"userId"`
}

// TeacherAddGroupMember POST /teacher/groups/:id/members — 小组老师将学生加入本组
func (h *Handler) TeacherAddGroupMember(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}
	gid := c.Param("id")
	if !h.teacherIsAdvisorOfGroup(uid, gid) {
		c.JSON(http.StatusForbidden, gin.H{"message": "仅小组老师可将学生加入本组"})
		return
	}
	var cnt int64
	h.db.Model(&model.Class{}).Where("id = ?", gid).Count(&cnt)
	if cnt == 0 {
		c.JSON(http.StatusNotFound, gin.H{"message": "学习小组不存在"})
		return
	}
	var req teacherAddMemberPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	var st model.User
	switch {
	case strings.TrimSpace(req.UserID) != "":
		if err := h.db.Where("id = ? AND role = ?", strings.TrimSpace(req.UserID), "STUDENT").First(&st).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "学生不存在"})
			return
		}
	case strings.TrimSpace(req.Username) != "":
		if err := h.db.Where("username = ? AND role = ?", strings.TrimSpace(req.Username), "STUDENT").First(&st).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "未找到该学生用户（请确认登录用户名）"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"message": "请提供 username 或 userId"})
		return
	}
	var n int64
	h.db.Model(&model.GroupMembership{}).Where("userId = ? AND classId = ?", st.ID, gid).Count(&n)
	if n > 0 {
		c.JSON(http.StatusOK, gin.H{"message": "该学生已在组内", "userId": st.ID, "displayName": st.DisplayName, "username": st.Username})
		return
	}
	gm := model.GroupMembership{
		ID:        newID(),
		UserID:    st.ID,
		ClassID:   gid,
		CreatedAt: model.Now(),
	}
	if err := h.db.Create(&gm).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "添加失败"})
		return
	}
	var u model.User
	if err := h.db.Select("classId").Where("id = ?", st.ID).Take(&u).Error; err == nil && (u.ClassID == nil || strings.TrimSpace(*u.ClassID) == "") {
		_ = h.db.Model(&model.User{}).Where("id = ?", st.ID).Updates(map[string]any{"classId": gid, "updatedAt": model.Now()}).Error
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok", "userId": st.ID, "displayName": st.DisplayName, "username": st.Username})
}

// TeacherRemoveGroupMember DELETE /teacher/groups/:id/members/:userId
func (h *Handler) TeacherRemoveGroupMember(c *gin.Context) {
	uid, ok := userIDFromCtx(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}
	gid := c.Param("id")
	sid := c.Param("userId")
	if !h.teacherIsAdvisorOfGroup(uid, gid) {
		c.JSON(http.StatusForbidden, gin.H{"message": "仅小组老师可将学生移出本组"})
		return
	}
	var st model.User
	if err := h.db.Where("id = ? AND role = ?", sid, "STUDENT").First(&st).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "学生不存在"})
		return
	}
	_ = h.db.Where("userId = ? AND classId = ?", sid, gid).Delete(&model.GroupMembership{}).Error

	var u model.User
	if err := h.db.Select("classId").Where("id = ?", sid).Take(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
		return
	}
	if u.ClassID == nil || strings.TrimSpace(*u.ClassID) != gid {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
		return
	}
	var nextIDs []string
	_ = h.db.Model(&model.GroupMembership{}).Where("userId = ?", sid).Limit(1).Pluck("classId", &nextIDs)
	updates := map[string]any{"updatedAt": model.Now()}
	if len(nextIDs) == 0 || strings.TrimSpace(nextIDs[0]) == "" {
		updates["classId"] = nil
	} else {
		updates["classId"] = strings.TrimSpace(nextIDs[0])
	}
	_ = h.db.Model(&model.User{}).Where("id = ?", sid).Updates(updates).Error
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}
