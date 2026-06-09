package handler

import (
	"net/http"
	"sort"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

type courseResp struct {
	ID                  string   `json:"id"`
	Title               string   `json:"title"`
	Description         string   `json:"description"`
	Cover               *string  `json:"cover,omitempty"`
	Difficulty          string   `json:"difficulty"`
	Duration            int      `json:"duration"`
	IsActive            bool     `json:"isActive"`            // 是否开课
	ClassID             *string  `json:"classId,omitempty"`   // 兼容：多组时取排序后第一个小组 id
	ClassIDs            []string `json:"classIds,omitempty"`  // 分配到的全部学习小组
	ClassName           *string  `json:"className,omitempty"` // 小组名称，多个用顿号连接
	HomeroomTeacherName *string  `json:"homeroomTeacherName,omitempty"`
	CreatedAt           int64    `json:"createdAt"`
	UpdatedAt           int64    `json:"updatedAt"`
	LabCount            int      `json:"labCount"`
	VideoCount          int      `json:"videoCount"`
	ExamCount           int      `json:"examCount"`
	MaterialCount       int      `json:"materialCount"`
	IsEnrolled          bool     `json:"isEnrolled"`
}

type courseRecord struct {
	ID          string  `gorm:"column:id"`
	Title       string  `gorm:"column:title"`
	Description string  `gorm:"column:description"`
	Cover       *string `gorm:"column:cover"`
	Difficulty  string  `gorm:"column:difficulty"`
	Duration    int     `gorm:"column:duration"`
	IsActive    bool    `gorm:"column:isActive"` // 是否开课
	ClassID     *string `gorm:"column:classId"`
	CreatedAt   int64   `gorm:"column:createdAt"`
	UpdatedAt   int64   `gorm:"column:updatedAt"`
}

type labSummary struct {
	ID          string  `gorm:"column:id" json:"id"`
	CourseID    string  `gorm:"column:courseId" json:"courseId"`
	Type        string  `gorm:"column:type" json:"type"` // lab, video, exam
	Title       string  `gorm:"column:title" json:"title"`
	Description string  `gorm:"column:description" json:"description"`
	Difficulty  string  `gorm:"column:difficulty" json:"difficulty"`
	Order       int     `gorm:"column:order" json:"order"`
	Points      int     `gorm:"column:points" json:"points"`
	TimeLimit   int     `gorm:"column:timeLimit" json:"timeLimit"`
	DockerImage string  `gorm:"column:dockerImage" json:"dockerImage"`
	ServerID    *string `gorm:"column:serverId" json:"serverId,omitempty"`
}

func (h *Handler) GetCourses(c *gin.Context) {
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var courses []courseRecord
	q := h.db.Table("courses").
		Select("id, title, description, cover, difficulty, duration, isActive, classId, cast(createdAt as integer) as createdAt, cast(updatedAt as integer) as updatedAt").
		Order("createdAt desc")

	switch {
	case role == "ADMIN" || role == "AUTHOR":
		// 可看全部课程
	case role == "TEACHER":
		visible, err := h.courseIDsVisibleForGroups(h.teacherAdvisedGroupIDs(uid))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Load courses failed"})
			return
		}
		if len(visible) == 0 {
			c.JSON(http.StatusOK, []courseResp{})
			return
		}
		q = q.Where("id IN ?", visible)
	case hasUser && role == "STUDENT":
		visible, err := h.courseIDsVisibleForGroups(h.studentGroupIDs(uid))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Load courses failed"})
			return
		}
		if len(visible) == 0 {
			c.JSON(http.StatusOK, []courseResp{})
			return
		}
		q = q.Where("id IN ? AND isActive = ?", visible, true)
	default:
		visible, err := h.courseIDsVisibleForGroups(nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Load courses failed"})
			return
		}
		if len(visible) == 0 {
			c.JSON(http.StatusOK, []courseResp{})
			return
		}
		q = q.Where("id IN ? AND isActive = ?", visible, true)
	}

	if err := q.Find(&courses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load courses failed"})
		return
	}

	type cclRow struct {
		CourseID string `gorm:"column:courseId"`
		ClassID  string `gorm:"column:classId"`
	}
	courseToLinks := make(map[string][]string)
	{
		if len(courses) > 0 {
			ids := make([]string, len(courses))
			for i := range courses {
				ids[i] = courses[i].ID
			}
			var linkRows []cclRow
			_ = h.db.Table("course_class_links").Where("courseId IN ?", ids).Find(&linkRows).Error
			for _, lr := range linkRows {
				courseToLinks[lr.CourseID] = append(courseToLinks[lr.CourseID], lr.ClassID)
			}
		}
	}

	// 列表中出现的班级 id → 班级名、班主任显示名（学生/老师/管理员共用，便于前端展示）
	classMeta := make(map[string]struct {
		Name        string
		TeacherName string
	})
	{
		seen := make(map[string]struct{}, len(courses)*2)
		var classIDs []string
		for _, co := range courses {
			gids := dedupeTrimmedStrings(courseToLinks[co.ID])
			if len(gids) == 0 && co.ClassID != nil && strings.TrimSpace(*co.ClassID) != "" {
				gids = []string{strings.TrimSpace(*co.ClassID)}
			}
			for _, cid := range gids {
				if _, ok := seen[cid]; ok {
					continue
				}
				seen[cid] = struct{}{}
				classIDs = append(classIDs, cid)
			}
		}
		if len(classIDs) > 0 {
			type metaRow struct {
				ID    string  `gorm:"column:id"`
				Name  string  `gorm:"column:name"`
				TName *string `gorm:"column:tname"`
			}
			var rows []metaRow
			_ = h.db.Table("classes c").
				Select("c.id, c.name, u.displayName as tname").
				Joins("LEFT JOIN users u ON u.id = c.homeroomTeacherId").
				Where("c.id IN ?", classIDs).
				Scan(&rows).Error
			for _, r := range rows {
				tn := ""
				if r.TName != nil {
					tn = *r.TName
				}
				classMeta[r.ID] = struct {
					Name        string
					TeacherName string
				}{Name: r.Name, TeacherName: tn}
			}
		}
	}

	// 按课程聚合实验类型数量（一次查询替代每门课 3 次 Count）
	type labAggRow struct {
		CourseID string `gorm:"column:courseId"`
		NormType string `gorm:"column:norm_type"`
		Cnt      int64  `gorm:"column:cnt"`
	}
	var labAgg []labAggRow
	if err := h.db.Raw(`
		SELECT courseId,
		       CASE WHEN type IS NULL OR type = '' THEN 'lab' ELSE type END AS norm_type,
		       COUNT(*) AS cnt
		FROM labs
		GROUP BY courseId, CASE WHEN type IS NULL OR type = '' THEN 'lab' ELSE type END
	`).Scan(&labAgg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load lab counts failed"})
		return
	}

	countsByCourse := make(map[string][3]int64, len(courses))
	for _, row := range labAgg {
		slot := countsByCourse[row.CourseID]
		switch row.NormType {
		case "video":
			slot[1] = row.Cnt
		case "exam":
			slot[2] = row.Cnt
		default:
			// lab 及未知类型归入实验类
			slot[0] += row.Cnt
		}
		countsByCourse[row.CourseID] = slot
	}

	type matAggRow struct {
		CourseID string `gorm:"column:courseId"`
		Cnt      int64  `gorm:"column:cnt"`
	}
	var matAgg []matAggRow
	if err := h.db.Table("course_materials").
		Select("courseId, COUNT(*) AS cnt").
		Group("courseId").
		Scan(&matAgg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load material counts failed"})
		return
	}
	materialByCourse := make(map[string]int64, len(matAgg))
	for _, row := range matAgg {
		materialByCourse[row.CourseID] = row.Cnt
	}

	enrolled := make(map[string]struct{})
	if hasUser {
		var courseIDs []string
		if err := h.db.Table("enrollments").Where("userId = ?", uid).Pluck("courseId", &courseIDs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Load enrollments failed"})
			return
		}
		for _, id := range courseIDs {
			enrolled[id] = struct{}{}
		}
	}

	res := make([]courseResp, 0, len(courses))
	for _, course := range courses {
		slot := countsByCourse[course.ID]
		_, isEnrolled := enrolled[course.ID]

		gids := dedupeTrimmedStrings(courseToLinks[course.ID])
		if len(gids) == 0 && course.ClassID != nil && strings.TrimSpace(*course.ClassID) != "" {
			gids = []string{strings.TrimSpace(*course.ClassID)}
		}
		sort.Strings(gids)

		var classIDPtr *string
		var cnamePtr, tnamePtr *string
		var classIDsOut []string
		if len(gids) > 0 {
			classIDsOut = append(classIDsOut, gids...)
			first := gids[0]
			classIDPtr = &first
			var nameParts []string
			for _, gid := range gids {
				if m, ok := classMeta[gid]; ok && m.Name != "" {
					nameParts = append(nameParts, m.Name)
				}
			}
			if len(nameParts) > 0 {
				joined := strings.Join(nameParts, "、")
				cnamePtr = &joined
			}
			if m, ok := classMeta[first]; ok && m.TeacherName != "" {
				t := m.TeacherName
				tnamePtr = &t
			}
		}

		res = append(res, courseResp{
			ID:                  course.ID,
			Title:               course.Title,
			Description:         course.Description,
			Cover:               course.Cover,
			Difficulty:          course.Difficulty,
			Duration:            course.Duration,
			IsActive:            course.IsActive,
			ClassID:             classIDPtr,
			ClassIDs:            classIDsOut,
			ClassName:           cnamePtr,
			HomeroomTeacherName: tnamePtr,
			CreatedAt:           course.CreatedAt,
			UpdatedAt:           course.UpdatedAt,
			LabCount:            int(slot[0]),
			VideoCount:          int(slot[1]),
			ExamCount:           int(slot[2]),
			MaterialCount:       int(materialByCourse[course.ID]),
			IsEnrolled:          isEnrolled,
		})
	}

	c.JSON(http.StatusOK, res)
}

func (h *Handler) GetCourse(c *gin.Context) {
	id := c.Param("courseId")
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var course courseRecord
	if err := h.db.Table("courses").
		Select("id, title, description, cover, difficulty, duration, isActive, classId, cast(createdAt as integer) as createdAt, cast(updatedAt as integer) as updatedAt").
		Where("id = ?", id).
		Take(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}

	var full model.Course
	full.ID = course.ID
	full.ClassID = course.ClassID
	full.IsActive = course.IsActive
	if !h.userCanViewCourse(&full, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问该课程"})
		return
	}

	var labs []labSummary
	if err := h.db.Table("labs").
		Select("id, courseId, type, title, description, difficulty, `order`, points, timeLimit, dockerImage, serverId").
		Where("courseId = ?", course.ID).
		Order("`order` asc").
		Find(&labs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load labs failed"})
		return
	}

	isEnrolled := false
	progress := 0
	if hasUser {
		// 使用 Limit(1).Find 而不是 Take，以避免当用户未报名时 GORM 抛出 "record not found" 警告日志
		var tempRows []struct {
			Progress int `gorm:"column:progress"`
		}
		h.db.Table("enrollments").
			Select("progress").
			Where("userId = ? AND courseId = ?", uid, course.ID).
			Limit(1).
			Find(&tempRows)

		if len(tempRows) > 0 {
			isEnrolled = true
			progress = tempRows[0].Progress
		}
	}

	gids := h.courseAssignedGroupIDs(course.ID)
	sort.Strings(gids)

	resp := gin.H{
		"id":          course.ID,
		"title":       course.Title,
		"description": course.Description,
		"cover":       course.Cover,
		"difficulty":  course.Difficulty,
		"duration":    course.Duration,
		"isActive":    course.IsActive,
		"classId":     course.ClassID,
		"classIds":    gids,
		"createdAt":   course.CreatedAt,
		"updatedAt":   course.UpdatedAt,
		"labs":        labs,
		"isEnrolled":  isEnrolled,
		"progress":    progress,
	}
	if len(gids) > 0 {
		type metaRow struct {
			ID    string  `gorm:"column:id"`
			Name  string  `gorm:"column:name"`
			TName *string `gorm:"column:tname"`
		}
		var rows []metaRow
		_ = h.db.Table("classes c").
			Select("c.id, c.name, u.displayName as tname").
			Joins("LEFT JOIN users u ON u.id = c.homeroomTeacherId").
			Where("c.id IN ?", gids).
			Scan(&rows).Error
		byID := make(map[string]metaRow, len(rows))
		for _, r := range rows {
			byID[r.ID] = r
		}
		var nameParts []string
		for _, gid := range gids {
			if r, ok := byID[gid]; ok && r.Name != "" {
				nameParts = append(nameParts, r.Name)
			}
		}
		if len(nameParts) > 0 {
			resp["className"] = strings.Join(nameParts, "、")
		}
		if r, ok := byID[gids[0]]; ok && r.TName != nil && *r.TName != "" {
			resp["homeroomTeacherName"] = *r.TName
		}
	}
	c.JSON(http.StatusOK, resp)
}

func (h *Handler) EnrollCourse(c *gin.Context) {
	courseID := c.Param("courseId")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	co, err := h.courseByID(courseID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}
	if !h.userCanViewCourse(co, uid, role, true) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无法报名该课程"})
		return
	}

	var e model.Enrollment
	err = h.db.Where("userId = ? AND courseId = ?", uid, courseID).First(&e).Error
	if err == nil {
		c.JSON(http.StatusOK, e)
		return
	}

	e = model.Enrollment{
		ID:       newID(),
		UserID:   uid,
		CourseID: courseID,
		Progress: 0,
	}
	if err := h.db.Create(&e).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Enroll failed"})
		return
	}

	// 记录活动日志
	h.LogActivity(uid, "enroll_course", "course", courseID, co.Title)

	c.JSON(http.StatusOK, e)
}

func (h *Handler) GetCourseProgress(c *gin.Context) {
	courseID := c.Param("courseId")
	uid, _ := userIDFromCtx(c)

	var e model.Enrollment
	if err := h.db.Where("userId = ? AND courseId = ?", uid, courseID).First(&e).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"progress": 0})
		return
	}

	c.JSON(http.StatusOK, e)
}
