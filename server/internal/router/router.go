package router

import (
	"net/http"
	"strings"
	"time"

	"sparklab/server/internal/auth"
	"sparklab/server/internal/config"
	"sparklab/server/internal/handler"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func New(cfg *config.Config, db *gorm.DB) *gin.Engine {
	r := gin.Default()
	if err := r.SetTrustedProxies([]string{"127.0.0.1", "::1"}); err != nil {
		panic(err)
	}

	// Parse multiple origins from WEB_URL (comma-separated)
	allowedOrigins := parseOrigins(cfg.WebURL)

	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	h := handler.New(db, cfg)
	h.StartContainerJanitor()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	r.GET("/classes", h.PublicListClasses)
	r.GET("/updates/check", h.PublicUpdateInfo)

	authGroup := r.Group("/auth")
	{
		authGroup.POST("/register", h.Register)
		authGroup.POST("/login", h.Login)
		authGroup.POST("/logout", h.Logout)
		authGroup.GET("/profile", h.GetProfile)
		authGroup.PUT("/profile", auth.JWTAuth(cfg.JWTSecret), h.UpdateProfile)
		authGroup.GET("/stats", auth.JWTAuth(cfg.JWTSecret), h.GetStats)
		authGroup.GET("/activities", auth.JWTAuth(cfg.JWTSecret), h.GetUserActivities)
		authGroup.GET("/check", auth.JWTAuth(cfg.JWTSecret), h.CheckAuth)
		authGroup.POST("/groups/join", auth.JWTAuth(cfg.JWTSecret), h.StudentJoinGroup)
		authGroup.POST("/groups/leave", auth.JWTAuth(cfg.JWTSecret), h.StudentLeaveGroup)
	}

	courseGroup := r.Group("/courses")
	courseGroup.Use(auth.OptionalJWTAuth(cfg.JWTSecret))
	{
		courseGroup.GET("", h.GetCourses)
		courseGroup.GET("/:courseId/materials", h.ListCourseMaterials)
		courseGroup.GET("/:courseId", h.GetCourse)
		courseGroup.POST("/:courseId/enroll", auth.JWTAuth(cfg.JWTSecret), h.EnrollCourse)
		courseGroup.GET("/:courseId/progress", auth.JWTAuth(cfg.JWTSecret), h.GetCourseProgress)
	}

	courseMatWrite := r.Group("/courses")
	courseMatWrite.Use(auth.JWTAuth(cfg.JWTSecret))
	{
		courseMatWrite.POST("/:courseId/materials", h.UploadCourseMaterial)
	}

	courseMatFile := r.Group("/course-materials")
	courseMatFile.Use(auth.JWTAuth(cfg.JWTSecret))
	{
		courseMatFile.GET("/:id/file", h.DownloadCourseMaterial)
		courseMatFile.GET("/:id", h.GetCourseMaterial)
		courseMatFile.POST("/:id/complete", h.CompleteCourseMaterial)
		courseMatFile.DELETE("/:id", h.DeleteCourseMaterial)
	}

	labGroup := r.Group("/labs")
	labGroup.Use(auth.OptionalJWTAuth(cfg.JWTSecret))
	{
		labGroup.GET("/:id", h.GetLab)
		labGroup.GET("/course/:courseId", h.GetLabsByCourse)
		labGroup.POST("/:id/submit", auth.JWTAuth(cfg.JWTSecret), h.SubmitLab)
		labGroup.POST("/:id/complete-video", auth.JWTAuth(cfg.JWTSecret), h.CompleteVideo)
		// 试卷相关
		labGroup.GET("/:id/questions", h.GetExamQuestions)
		labGroup.POST("/:id/submit-exam", auth.JWTAuth(cfg.JWTSecret), h.SubmitExam)
	}

	// 试卷提交详情
	submissionGroup := r.Group("/submissions")
	submissionGroup.Use(auth.JWTAuth(cfg.JWTSecret))
	{
		submissionGroup.GET("/:submissionId", h.GetExamSubmission)
		submissionGroup.PATCH("/:submissionId/grade", h.GradeSubmission)
	}

	containerGroup := r.Group("/containers")
	containerGroup.Use(auth.JWTAuth(cfg.JWTSecret))
	{
		containerGroup.POST("", h.CreateContainer)
		containerGroup.GET("", h.GetContainers)
		containerGroup.GET("/:id", h.GetContainer)
		containerGroup.POST("/:id/start", h.StartContainer)
		containerGroup.POST("/:id/stop", h.StopContainer)
		containerGroup.DELETE("/:id", h.RemoveContainer)
		containerGroup.POST("/:id/heartbeat", h.ContainerHeartbeat)
		containerGroup.POST("/:id/exec", h.ExecContainer)
		containerGroup.POST("/:id/exec/create", h.ExecCreateContainer)
		containerGroup.POST("/:id/exec/start", h.ExecStartContainer)
		containerGroup.GET("/:id/terminal", h.UserContainerTerminal)
	}

	adminGroup := r.Group("/admin")
	adminGroup.Use(auth.JWTAuth(cfg.JWTSecret), h.RequireAdmin())
	{
		adminGroup.GET("/stats", h.AdminStats)
		adminGroup.GET("/users", h.AdminGetUsers)
		adminGroup.POST("/users", h.AdminCreateUser)
		adminGroup.PUT("/users/:id", h.AdminUpdateUser)
		adminGroup.DELETE("/users/:id", h.AdminDeleteUser)
		adminGroup.GET("/containers", h.AdminGetContainers)
		adminGroup.POST("/containers/:id/force-stop", h.AdminForceStopContainer)
		adminGroup.GET("/servers/:serverId/available-port", h.AdminGetAvailablePort)
		adminGroup.GET("/local/status", h.LocalSystemStatus)
		adminGroup.GET("/updates/check", h.CheckForUpdates)
		adminGroup.GET("/updates/status", h.UpdateApplyStatus)
		adminGroup.POST("/updates/apply", h.ApplyUpdate)
	}

	serverGroup := r.Group("/servers")
	serverGroup.Use(auth.JWTAuth(cfg.JWTSecret), h.RequireAdmin())
	{
		serverGroup.POST("", h.CreateServer)
		serverGroup.GET("", h.GetServers)
		serverGroup.GET("/:id", h.GetServer)
		serverGroup.POST("/:id/refresh", h.RefreshServerStats)
		serverGroup.GET("/:id/containers", h.GetServerContainers)
		serverGroup.GET("/:id/images", h.GetServerImages)
		serverGroup.POST("/:id/images/pull", h.PullServerImage)
		serverGroup.POST("/:id/images/build", h.BuildServerImage)
		serverGroup.DELETE("/:id/images/:imageId", h.RemoveServerImage)
		serverGroup.POST("/:id/containers/:containerId/start", h.StartServerContainer)
		serverGroup.POST("/:id/containers/:containerId/stop", h.StopServerContainer)
		serverGroup.DELETE("/:id/containers/:containerId", h.RemoveServerContainer)
		serverGroup.GET("/:id/containers/:containerId/terminal", h.ContainerTerminal)
		serverGroup.GET("/:id/networks", h.GetServerNetworks)
		serverGroup.POST("/:id/networks", h.CreateServerNetwork)
		serverGroup.DELETE("/:id/networks/:networkId", h.RemoveServerNetwork)
		serverGroup.PUT("/:id", h.UpdateServer)
		serverGroup.DELETE("/:id", h.DeleteServer)
	}

	// Monitoring endpoints
	monitorGroup := r.Group("/monitor")
	monitorGroup.Use(auth.JWTAuth(cfg.JWTSecret), h.RequireAdmin())
	{
		// Resource monitoring
		monitorGroup.GET("/resources", h.GetResourceStats)
		monitorGroup.GET("/resources/stream", h.StreamResourceStats)

		// Docker container monitoring and control
		monitorGroup.GET("/docker/containers", h.GetDockerContainers)
		monitorGroup.GET("/docker/containers/:id", h.InspectDockerContainer)
		monitorGroup.GET("/docker/containers/:id/stats", h.GetDockerContainerStats)
		monitorGroup.GET("/docker/containers/:id/stats/stream", h.StreamDockerContainerStats)
		monitorGroup.GET("/docker/containers/:id/logs", h.GetDockerContainerLogs)
		monitorGroup.POST("/docker/containers/:id/:action", h.ControlDockerContainer)
	}

	// Volume management endpoints
	volumeGroup := r.Group("/volumes")
	volumeGroup.Use(auth.JWTAuth(cfg.JWTSecret), h.RequireAdmin())
	{
		volumeGroup.GET("", h.GetVolumes)
		volumeGroup.GET("/:name", h.GetVolume)
		volumeGroup.POST("", h.CreateVolume)
		volumeGroup.DELETE("/:name", h.RemoveVolume)
	}

	teacherGroup := r.Group("/teacher")
	teacherGroup.Use(auth.JWTAuth(cfg.JWTSecret), h.RequireTeacher())
	{
		teacherGroup.GET("/groups", h.TeacherListGroups)
		teacherGroup.POST("/groups", h.TeacherCreateGroup)
		teacherGroup.POST("/groups/:id/members", h.TeacherAddGroupMember)
		teacherGroup.DELETE("/groups/:id/members/:userId", h.TeacherRemoveGroupMember)
		teacherGroup.PATCH("/groups/:id", h.TeacherUpdateGroup)
		teacherGroup.DELETE("/groups/:id", h.TeacherDeleteGroup)
		teacherGroup.GET("/servers", h.GetServers)
		teacherGroup.GET("/servers/:serverId/available-port", h.AdminGetAvailablePort)
		teacherGroup.GET("/servers/:serverId/images", h.GetServerImages)
		teacherGroup.GET("/overview", h.TeacherOverview)
		teacherGroup.GET("/students", h.TeacherListStudents)
		teacherGroup.GET("/submissions", h.TeacherListSubmissions)
		teacherGroup.GET("/gradebook", h.TeacherGradebook)
		teacherGroup.GET("/courses/:courseId/labs", h.GetLabsByCourse)
		teacherGroup.GET("/courses", h.TeacherListCourses)
		teacherGroup.POST("/courses", h.TeacherCreateCourse)
		teacherGroup.PUT("/courses/:id", h.TeacherUpdateCourse)
		teacherGroup.PATCH("/courses/:id/toggle-active", h.TeacherToggleCourseActive)
		teacherGroup.POST("/labs", h.TeacherCreateLab)
		teacherGroup.PUT("/labs/:id", h.TeacherUpdateLab)
		teacherGroup.GET("/labs/:id", h.TeacherGetLab)
		teacherGroup.POST("/labs/:id/questions", h.TeacherSaveExamQuestions)
	}

	return r
}

// parseOrigins splits comma-separated origins and trims whitespace
func parseOrigins(webURL string) []string {
	origins := strings.Split(webURL, ",")
	result := make([]string, 0, len(origins))
	for _, origin := range origins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	if len(result) == 0 {
		return []string{"http://localhost:3000"}
	}
	return result
}
