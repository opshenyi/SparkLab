package handler

import (
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

const maxMaterialUpload = 40 << 20 // 40MB
const materialUploadOverhead = 1 << 20

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

func materialMimeForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".pdf":
		return "application/pdf"
	case ".doc":
		return "application/msword"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".ppt":
		return "application/vnd.ms-powerpoint"
	case ".pptx":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	default:
		return "application/octet-stream"
	}
}

func validateMaterialHeader(ext string, head []byte) bool {
	ext = strings.ToLower(ext)
	if len(head) == 0 {
		return false
	}
	switch ext {
	case ".pdf":
		return len(head) >= 5 && string(head[:5]) == "%PDF-"
	case ".docx", ".pptx":
		return len(head) >= 4 && head[0] == 0x50 && head[1] == 0x4b && head[2] == 0x03 && head[3] == 0x04
	case ".doc", ".ppt":
		return len(head) >= 8 &&
			head[0] == 0xd0 && head[1] == 0xcf && head[2] == 0x11 && head[3] == 0xe0 &&
			head[4] == 0xa1 && head[5] == 0xb1 && head[6] == 0x1a && head[7] == 0xe1
	default:
		return false
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
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)
	var mats []model.CourseMaterial
	if err := h.db.Where("courseId = ?", courseID).Order("sortOrder asc, createdAt asc").Find(&mats).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "加载课件失败"})
		return
	}
	completed := map[string]bool{}
	if hasUser && role == "STUDENT" && len(mats) > 0 {
		ids := make([]string, 0, len(mats))
		for _, m := range mats {
			ids = append(ids, m.ID)
		}
		var progressRows []model.MaterialProgress
		_ = h.db.Where("userId = ? AND materialId IN ? AND completed = ?", uid, ids, true).Find(&progressRows).Error
		for _, row := range progressRows {
			completed[row.MaterialID] = true
		}
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
			"completed":    completed[m.ID],
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
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxMaterialUpload+materialUploadOverhead)
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请选择文件"})
		return
	}
	if fh.Size <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "文件为空"})
		return
	}
	if fh.Size > maxMaterialUpload {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"message": "文件过大"})
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
	head := make([]byte, 512)
	n, readErr := io.ReadFull(src, head)
	if readErr != nil && readErr != io.ErrUnexpectedEOF {
		c.JSON(http.StatusBadRequest, gin.H{"message": "读取文件头失败"})
		return
	}
	if !validateMaterialHeader(ext, head[:n]) {
		c.JSON(http.StatusBadRequest, gin.H{"message": "文件内容与扩展名不匹配"})
		return
	}
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "读取文件失败"})
		return
	}

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
	limited := &io.LimitedReader{R: src, N: maxMaterialUpload + 1}
	written, err := io.Copy(dst, limited)
	if err != nil {
		_ = os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "保存文件失败"})
		return
	}
	if written > maxMaterialUpload {
		_ = os.Remove(destPath)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"message": "文件过大"})
		return
	}
	mimeType := materialMimeForExt(ext)

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

	var materialProgress *gin.H
	if role == "STUDENT" {
		var progress model.MaterialProgress
		if err := h.db.Where("userId = ? AND materialId = ?", uid, mat.ID).Limit(1).Find(&progress).Error; err == nil && progress.ID != "" {
			materialProgress = &gin.H{
				"completed":   progress.Completed,
				"completedAt": progress.CompletedAt,
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":               mat.ID,
		"courseId":         mat.CourseID,
		"title":            mat.Title,
		"originalName":     mat.OriginalName,
		"mimeType":         mat.MimeType,
		"fileKind":         mat.FileKind,
		"sortOrder":        mat.SortOrder,
		"createdAt":        mat.CreatedAt,
		"materialProgress": materialProgress,
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

	f, err := os.Open(mat.StoredPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "文件已丢失"})
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		c.JSON(http.StatusNotFound, gin.H{"message": "文件已丢失"})
		return
	}
	c.Header("Content-Type", mat.MimeType)
	safeName := filepath.Base(strings.ReplaceAll(mat.OriginalName, `"`, `'`))
	c.Header("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": safeName}))
	http.ServeContent(c.Writer, c.Request, safeName, info.ModTime(), f)
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
