package handler

import (
	"net/http"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *Handler) teacherIsAdvisorOfGroup(teacherUserID, groupID string) bool {
	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		return false
	}
	var cl model.Class
	if err := h.db.Select("homeroomTeacherId").Where("id = ?", groupID).Take(&cl).Error; err != nil {
		return false
	}
	return cl.HomeroomTeacherID != nil && strings.TrimSpace(*cl.HomeroomTeacherID) == teacherUserID
}

func (h *Handler) teacherAdvisedGroupIDs(teacherUserID string) []string {
	var ids []string
	_ = h.db.Model(&model.Class{}).Where("homeroomTeacherId = ?", teacherUserID).Pluck("id", &ids).Error
	return ids
}

// studentGroupIDs 学生所在学习小组（含 memberships 与历史 users.classId）
func (h *Handler) studentGroupIDs(userID string) []string {
	var ids []string
	_ = h.db.Model(&model.GroupMembership{}).Where("userId = ?", userID).Pluck("classId", &ids).Error
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids)+1)
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	var u model.User
	if err := h.db.Select("classId", "role").Where("id = ?", userID).Take(&u).Error; err != nil {
		return out
	}
	if u.Role != "STUDENT" || u.ClassID == nil {
		return out
	}
	cid := strings.TrimSpace(*u.ClassID)
	if cid == "" {
		return out
	}
	if _, ok := seen[cid]; ok {
		return out
	}
	return append(out, cid)
}

// userCanViewCourse 未登录仅可看「全校公开课」（未分配任何学习小组）
func (h *Handler) userCanViewCourse(course *model.Course, userID, role string, hasUser bool) bool {
	if course == nil {
		return false
	}
	if role == "ADMIN" || role == "AUTHOR" {
		return true
	}
	assigned := h.courseAssignedGroupIDs(course.ID)
	if len(assigned) == 0 {
		return true
	}
	if role == "TEACHER" {
		for _, g := range assigned {
			if h.teacherIsAdvisorOfGroup(userID, g) {
				return true
			}
		}
		return false
	}
	if !hasUser || role == "" {
		return false
	}
	if role != "STUDENT" {
		return false
	}
	studentG := h.studentGroupIDs(userID)
	seen := make(map[string]struct{}, len(studentG))
	for _, g := range studentG {
		seen[g] = struct{}{}
	}
	for _, cg := range assigned {
		if _, ok := seen[cg]; ok {
			return true
		}
	}
	return false
}

func (h *Handler) teacherManagesCourse(userID, courseID string) bool {
	assigned := h.courseAssignedGroupIDs(courseID)
	if len(assigned) == 0 {
		return false
	}
	for _, g := range assigned {
		if h.teacherIsAdvisorOfGroup(userID, g) {
			return true
		}
	}
	return false
}

func (h *Handler) abortUnlessCourseVisible(c *gin.Context, courseID string) bool {
	var course model.Course
	if err := h.db.Where("id = ?", courseID).First(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return true
	}
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)
	if !h.userCanViewCourse(&course, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问该课程"})
		return true
	}
	return false
}

func (h *Handler) courseByID(courseID string) (*model.Course, error) {
	var course model.Course
	if err := h.db.Where("id = ?", courseID).First(&course).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (h *Handler) labCourseID(labID string) (string, error) {
	var lab model.Lab
	if err := h.db.Select("courseId").Where("id = ?", labID).Take(&lab).Error; err != nil {
		return "", err
	}
	return lab.CourseID, nil
}
