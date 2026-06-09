package handler

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

const maxMaterialUpload = 40 << 20 // 40MB

func materialUploadDir() string {
	return filepath.Join("uploads", "course_materials")
}

func extToKind(ext string) string {
	switch strings.ToLower(ext) {
	case ".pdf":
		return "pdf"
	case ".doc", ".docx":
		return "word"
	case ".ppt", ".pptx":
		return "ppt"
	default:
		return "other"
	}
}

func (h *Handler) ensureMaterialDir() error {
	dir := materialUploadDir()
	return os.MkdirAll(dir, 0o755)
}

func (h *Handler) canManageCourseMaterials(userID, role, courseID string) bool {
	if role == "ADMIN" || role == "AUTHOR" {
		return true
	}
	if role == "TEACHER" {
		return h.teacherManagesCourse(userID, courseID)
	}
	return false
}

// ListCourseMaterials GET /courses/:courseId/materials
func (h *Handler) ListCourseMaterials(c *gin.Context) {
	courseID := c.Param("courseId")
	if h.abortUnlessCourseVisible(c, courseID) {
		return
	}
	var mats []model.CourseMaterial
	if err := h.db.Where("courseId = ?", courseID).Order("sortOrder asc, createdAt asc").Find(&mats).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课件失败"})
		return
	}
	out := make([]gin.H, 0, len(mats))
	for _, m := range mats {
		out = append(out, gin.H{
			"id":           m.ID,
			"courseId":     m.CourseID,
			"title":        m.Title,
			"originalName": m.OriginalName,
			"mimeType":     m.MimeType,
			"fileKind":     m.FileKind,
			"sortOrder":    m.SortOrder,
			"createdAt":    m.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, out)
}

// UploadCourseMaterial POST multipart courseId in path
func (h *Handler) UploadCourseMaterial(c *gin.Context) {
	courseID := c.Param("courseId")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)
	if !h.canManageCourseMaterials(uid, role, courseID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权上传课件"})
		return
	}

	title := strings.TrimSpace(c.PostForm("title"))
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请填写课件标题"})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请选择文件"})
		return
	}
	if fh.Size > maxMaterialUpload {
		c.JSON(http.StatusBadRequest, gin.H{"message": "文件过大"})
		return
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if ext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "文件需带扩展名"})
		return
	}
	kind := extToKind(ext)
	if kind == "other" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "仅支持 PDF、Word、PowerPoint 文件"})
		return
	}

	src, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "读取文件失败"})
		return
	}
	defer src.Close()

	if err := h.ensureMaterialDir(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "创建目录失败"})
		return
	}
	storedName := newID() + ext
	destPath := filepath.Join(materialUploadDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "保存文件失败"})
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "保存文件失败"})
		return
	}

	mimeType := fh.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		switch kind {
		case "pdf":
			mimeType = "application/pdf"
		case "word":
			mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		case "ppt":
			mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
		default:
			if mimeType == "" {
				mimeType = "application/octet-stream"
			}
		}
	}

	var maxOrder int
	_ = h.db.Raw("SELECT COALESCE(MAX(sortOrder), 0) FROM course_materials WHERE courseId = ?", courseID).Scan(&maxOrder)

	mat := model.CourseMaterial{
		ID:           newID(),
		CourseID:     courseID,
		Title:        title,
		OriginalName: fh.Filename,
		StoredPath:   destPath,
		MimeType:     mimeType,
		FileKind:     kind,
		SortOrder:    maxOrder + 1,
		CreatedAt:    model.Now(),
	}
	if err := h.db.Create(&mat).Error; err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "保存记录失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           mat.ID,
		"courseId":     mat.CourseID,
		"title":        mat.Title,
		"originalName": mat.OriginalName,
		"mimeType":     mat.MimeType,
		"fileKind":     mat.FileKind,
		"sortOrder":    mat.SortOrder,
		"createdAt":    mat.CreatedAt,
	})
}

// GetCourseMaterial GET /course-materials/:id — 课件元数据（独立学习页用，需能查看该课程）
func (h *Handler) GetCourseMaterial(c *gin.Context) {
	id := c.Param("id")
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var mat model.CourseMaterial
	if err := h.db.Where("id = ?", id).First(&mat).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "课件不存在"})
		return
	}
	var course model.Course
	if err := h.db.Where("id = ?", mat.CourseID).First(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "课程不存在"})
		return
	}
	if !hasUser || !h.userCanViewCourse(&course, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           mat.ID,
		"courseId":     mat.CourseID,
		"title":        mat.Title,
		"originalName": mat.OriginalName,
		"mimeType":     mat.MimeType,
		"fileKind":     mat.FileKind,
		"sortOrder":    mat.SortOrder,
		"createdAt":    mat.CreatedAt,
	})
}

// DownloadCourseMaterial streams file inline (for PDF iframe)
func (h *Handler) DownloadCourseMaterial(c *gin.Context) {
	id := c.Param("id")
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var mat model.CourseMaterial
	if err := h.db.Where("id = ?", id).First(&mat).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "课件不存在"})
		return
	}
	var course model.Course
	if err := h.db.Where("id = ?", mat.CourseID).First(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "课程不存在"})
		return
	}
	if !hasUser || !h.userCanViewCourse(&course, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问"})
		return
	}

	data, err := os.ReadFile(mat.StoredPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "文件已丢失"})
		return
	}
	c.Header("Content-Type", mat.MimeType)
	safeName := strings.ReplaceAll(mat.OriginalName, `"`, `'`)
	c.Header("Content-Disposition", "inline; filename=\""+safeName+"\"")
	c.Data(http.StatusOK, mat.MimeType, data)
}

func (h *Handler) DeleteCourseMaterial(c *gin.Context) {
	id := c.Param("id")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	var mat model.CourseMaterial
	if err := h.db.Where("id = ?", id).First(&mat).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "课件不存在"})
		return
	}
	if !h.canManageCourseMaterials(uid, role, mat.CourseID) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权删除"})
		return
	}
	_ = os.Remove(mat.StoredPath)
	_ = h.db.Delete(&model.CourseMaterial{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}
