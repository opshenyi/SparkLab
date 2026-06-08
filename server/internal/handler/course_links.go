package handler

import (
	"sort"
	"strings"

	"sparklab/server/internal/model"

	"gorm.io/gorm"
)

func dedupeTrimmedStrings(in []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

// courseAssignedGroupIDs 课程分配到的学习小组；优先读关联表，无记录时回退 courses.classId（兼容旧数据）
func (h *Handler) courseAssignedGroupIDs(courseID string) []string {
	var ids []string
	_ = h.db.Model(&model.CourseClassLink{}).Where("courseId = ?", courseID).Pluck("classId", &ids).Error
	ids = dedupeTrimmedStrings(ids)
	if len(ids) > 0 {
		return ids
	}
	var c model.Course
	if err := h.db.Select("classId").Where("id = ?", courseID).Take(&c).Error; err != nil {
		return nil
	}
	if c.ClassID == nil {
		return nil
	}
	s := strings.TrimSpace(*c.ClassID)
	if s == "" {
		return nil
	}
	return []string{s}
}

// replaceCourseClassLinks 替换课程与小组关联，并同步 courses.classId（取排序后第一个，无关联则为 NULL）
func (h *Handler) replaceCourseClassLinks(courseID string, classIDs []string) error {
	classIDs = dedupeTrimmedStrings(classIDs)
	return h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("courseId = ?", courseID).Delete(&model.CourseClassLink{}).Error; err != nil {
			return err
		}
		for _, gid := range classIDs {
			link := model.CourseClassLink{
				ID:        newID(),
				CourseID:  courseID,
				ClassID:   gid,
				CreatedAt: model.Now(),
			}
			if err := tx.Create(&link).Error; err != nil {
				return err
			}
		}
		var primary any
		if len(classIDs) == 0 {
			primary = nil
		} else {
			sorted := append([]string(nil), classIDs...)
			sort.Strings(sorted)
			primary = sorted[0]
		}
		return tx.Model(&model.Course{}).Where("id = ?", courseID).Update("classId", primary).Error
	})
}

// courseIDsVisibleForGroups 学生/老师可见的课程 id：全校公开课 + 分配到任一所给小组的课程（含仅写在 courses.classId 的遗留行）
func (h *Handler) courseIDsVisibleForGroups(groupIDs []string) ([]string, error) {
	if len(groupIDs) == 0 {
		var ids []string
		err := h.db.Raw(`
			SELECT id FROM courses c
			WHERE (c.classId IS NULL OR TRIM(c.classId) = '')
			AND NOT EXISTS (SELECT 1 FROM course_class_links l WHERE l.courseId = c.id)
		`).Scan(&ids).Error
		return ids, err
	}
	var ids []string
	err := h.db.Raw(`
		SELECT DISTINCT c.id FROM courses c
		WHERE (
			(c.classId IS NULL OR TRIM(c.classId) = '')
			AND NOT EXISTS (SELECT 1 FROM course_class_links l0 WHERE l0.courseId = c.id)
		)
		OR EXISTS (SELECT 1 FROM course_class_links l WHERE l.courseId = c.id AND l.classId IN ?)
		OR (
			c.classId IN ?
			AND NOT EXISTS (SELECT 1 FROM course_class_links l2 WHERE l2.courseId = c.id)
		)
	`, groupIDs, groupIDs).Scan(&ids).Error
	return ids, err
}

// countCoursesReferencingGroup 删除小组前：仍关联该小组的课程数量（关联表 + 仅 classId 且无关联行的遗留课）
func (h *Handler) countCoursesReferencingGroup(groupID string) int64 {
	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		return 0
	}
	var n int64
	_ = h.db.Raw(`
		SELECT COUNT(*) FROM (
			SELECT courseId AS cid FROM course_class_links WHERE classId = ?
			UNION
			SELECT id AS cid FROM courses WHERE classId = ? AND id NOT IN (SELECT DISTINCT courseId FROM course_class_links)
		) AS t
	`, groupID, groupID).Scan(&n).Error
	return n
}

// courseIDsForTeacherGroup 学情大屏：某小组下的课程 id（含多组课程中命中该组的）
func (h *Handler) courseIDsForTeacherGroup(groupID string) ([]string, error) {
	groupID = strings.TrimSpace(groupID)
	var ids []string
	err := h.db.Raw(`
		SELECT DISTINCT c.id FROM courses c
		WHERE EXISTS (SELECT 1 FROM course_class_links l WHERE l.courseId = c.id AND l.classId = ?)
		OR (c.classId = ? AND NOT EXISTS (SELECT 1 FROM course_class_links l2 WHERE l2.courseId = c.id))
	`, groupID, groupID).Scan(&ids).Error
	return ids, err
}
