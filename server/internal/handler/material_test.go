package handler

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"testing"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestUploadCourseMaterialAcceptsValidPDF(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Chdir(t.TempDir())
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	mustCreate(t, h.db.Create(&model.Course{ID: "material-upload-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)

	w := performMaterialUpload(
		t,
		h,
		"material-upload-course",
		"guide.pdf",
		"application/octet-stream",
		[]byte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"),
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var mat model.CourseMaterial
	mustCreate(t, h.db.Where("courseId = ?", "material-upload-course").Take(&mat).Error)
	if mat.MimeType != "application/pdf" || mat.FileKind != "pdf" {
		t.Fatalf("expected normalized pdf metadata, got mime=%s kind=%s", mat.MimeType, mat.FileKind)
	}
	if _, err := os.Stat(mat.StoredPath); err != nil {
		t.Fatalf("expected uploaded file to exist: %v", err)
	}
}

func TestUploadCourseMaterialRejectsSpoofedPDF(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Chdir(t.TempDir())
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	mustCreate(t, h.db.Create(&model.Course{ID: "material-spoof-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)

	w := performMaterialUpload(
		t,
		h,
		"material-spoof-course",
		"guide.pdf",
		"application/pdf",
		[]byte("this is not really a pdf"),
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}

	var count int64
	h.db.Model(&model.CourseMaterial{}).Where("courseId = ?", "material-spoof-course").Count(&count)
	if count != 0 {
		t.Fatalf("expected no material record after spoofed upload, got %d", count)
	}
}

func performMaterialUpload(t *testing.T, h *Handler, courseID, fileName, contentType string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)
	mustCreate(t, writer.WriteField("title", "Guide"))
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+fileName+`"`)
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	mustCreate(t, err)
	_, err = part.Write(body)
	mustCreate(t, err)
	mustCreate(t, writer.Close())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/courses/"+courseID+"/materials", &payload)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	c.Params = gin.Params{{Key: "courseId", Value: courseID}}
	c.Set("userId", "admin-user")
	c.Set("role", "ADMIN")
	h.UploadCourseMaterial(c)
	return w
}
