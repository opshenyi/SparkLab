package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func autoStopTimeout() time.Duration {
	ms := envInt("AUTO_STOP_TIMEOUT", 1800000)
	if ms <= 0 {
		ms = 1800000
	}
	return time.Duration(ms) * time.Millisecond
}

type createContainerReq struct {
	LabID string `json:"labId"`
}

type execCommandReq struct {
	Command string `json:"command"`
}

type execCreateReq struct {
	Command string         `json:"command"`
	Options map[string]any `json:"options"`
}

type execStartReq struct {
	ExecID  string         `json:"execId"`
	Options map[string]any `json:"options"`
}

func (h *Handler) CreateContainer(c *gin.Context) {
	uid, _ := userIDFromCtx(c)

	var activeCount int64
	h.db.Model(&model.Container{}).
		Where("userId = ? AND status IN ?", uid, []string{"creating", "running"}).
		Count(&activeCount)

	maxContainers := envInt("MAX_CONTAINERS_PER_USER", 3)
	if int(activeCount) >= maxContainers {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Maximum containers per user exceeded"})
		return
	}

	var req createContainerReq
	if err := c.ShouldBindJSON(&req); err != nil || req.LabID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "labId is required"})
		return
	}

	var lab model.Lab
	if err := h.db.Where("id = ?", req.LabID).First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}

	server, err := h.ensureLocalDockerServer()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Prepare local Docker node failed"})
		return
	}
	serverID := localDockerServerID

	// 先在数据库中创建容器记录（状态为 creating）
	now := time.Now()
	autoStopAt := now.Add(autoStopTimeout())
	container := model.Container{
		ID:           newID(),
		UserID:       uid,
		LabID:        req.LabID,
		ServerID:     &serverID,
		ContainerID:  "", // 将在创建后填充
		Status:       "creating",
		PortMappings: lab.PortMappings,
		CPULimit:     lab.CPULimit,
		MemoryLimit:  lab.MemoryLimit,
		CreatedAt:    now,
		LastActiveAt: now,
		AutoStopAt:   &autoStopAt,
	}

	if err := h.db.Create(&container).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Create container record failed"})
		return
	}

	// 异步创建 Docker 容器
	containerID := container.ID // 复制 ID 以避免闭包问题
	go h.createDockerContainer(containerID, &container, &lab, server)

	c.JSON(http.StatusCreated, container)
}

func (h *Handler) GetContainers(c *gin.Context) {
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	type row struct {
		ID           string  `gorm:"column:id"`
		UserID       string  `gorm:"column:userId"`
		LabID        string  `gorm:"column:labId"`
		ServerID     string  `gorm:"column:serverId"`
		ContainerID  string  `gorm:"column:containerId"`
		Status       string  `gorm:"column:status"`
		PortMappings string  `gorm:"column:portMappings"`
		CPULimit     float64 `gorm:"column:cpuLimit"`
		MemoryLimit  int64   `gorm:"column:memoryLimit"`
		CreatedAt    int64   `gorm:"column:createdAt"`
		StartedAt    *int64  `gorm:"column:startedAt"`
		StoppedAt    *int64  `gorm:"column:stoppedAt"`
		LastActiveAt int64   `gorm:"column:lastActiveAt"`
		AutoStopAt   *int64  `gorm:"column:autoStopAt"`
		LabTitle     *string `gorm:"column:labTitle"`
		LabType      *string `gorm:"column:labType"`
	}

	q := h.db.Table("containers c").
		Select("c.id, c.userId, c.labId, c.serverId, c.containerId, c.status, c.portMappings, c.cpuLimit, c.memoryLimit, strftime('%s', c.createdAt) as createdAt, strftime('%s', c.startedAt) as startedAt, strftime('%s', c.stoppedAt) as stoppedAt, strftime('%s', c.lastActiveAt) as lastActiveAt, strftime('%s', c.autoStopAt) as autoStopAt, l.title as labTitle, l.type as labType").
		Joins("LEFT JOIN labs l ON l.id = c.labId").
		Order("c.createdAt desc")
	if role != "ADMIN" {
		q = q.Where("c.userId = ?", uid)
	}

	var rows []row
	if err := q.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load containers failed"})
		return
	}

	resp := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		// 将时间戳转换为毫秒（JavaScript 需要毫秒）
		createdAtMs := r.CreatedAt * 1000
		lastActiveAtMs := r.LastActiveAt * 1000
		var startedAtMs, stoppedAtMs, autoStopAtMs *int64
		if r.StartedAt != nil {
			ms := *r.StartedAt * 1000
			startedAtMs = &ms
		}
		if r.StoppedAt != nil {
			ms := *r.StoppedAt * 1000
			stoppedAtMs = &ms
		}
		if r.AutoStopAt != nil {
			ms := *r.AutoStopAt * 1000
			autoStopAtMs = &ms
		}

		resp = append(resp, gin.H{
			"id":           r.ID,
			"userId":       r.UserID,
			"labId":        r.LabID,
			"serverId":     r.ServerID,
			"containerId":  r.ContainerID,
			"status":       r.Status,
			"portMappings": r.PortMappings,
			"cpuLimit":     r.CPULimit,
			"memoryLimit":  r.MemoryLimit,
			"createdAt":    createdAtMs,
			"startedAt":    startedAtMs,
			"stoppedAt":    stoppedAtMs,
			"lastActiveAt": lastActiveAtMs,
			"autoStopAt":   autoStopAtMs,
			"lab": gin.H{
				"id":    r.LabID,
				"title": r.LabTitle,
				"type":  r.LabType,
			},
		})
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) getOwnedContainer(c *gin.Context, id string) (*model.Container, bool) {
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	// 使用临时结构体来接收 cast 后的整数时间戳
	type containerRow struct {
		ID           string  `gorm:"column:id"`
		UserID       string  `gorm:"column:userId"`
		LabID        string  `gorm:"column:labId"`
		ServerID     *string `gorm:"column:serverId"`
		ContainerID  string  `gorm:"column:containerId"`
		Status       string  `gorm:"column:status"`
		PortMappings *string `gorm:"column:portMappings"`
		CPULimit     float64 `gorm:"column:cpuLimit"`
		MemoryLimit  int     `gorm:"column:memoryLimit"`
		CreatedAt    int64   `gorm:"column:createdAt"`
		StartedAt    *int64  `gorm:"column:startedAt"`
		StoppedAt    *int64  `gorm:"column:stoppedAt"`
		LastActiveAt int64   `gorm:"column:lastActiveAt"`
		AutoStopAt   *int64  `gorm:"column:autoStopAt"`
	}

	var row containerRow
	err := h.db.Table("containers").
		Select("id, userId, labId, serverId, containerId, status, portMappings, cpuLimit, memoryLimit, cast(createdAt as integer) as createdAt, cast(startedAt as integer) as startedAt, cast(stoppedAt as integer) as stoppedAt, cast(lastActiveAt as integer) as lastActiveAt, cast(autoStopAt as integer) as autoStopAt").
		Where("id = ?", id).
		First(&row).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Container not found"})
		return nil, false
	}

	if role != "ADMIN" && row.UserID != uid {
		c.JSON(http.StatusForbidden, gin.H{"message": "Access denied"})
		return nil, false
	}

	// 转换为 model.Container
	createdAt := time.Unix(row.CreatedAt, 0)
	lastActiveAt := time.Unix(row.LastActiveAt, 0)

	var startedAt, stoppedAt, autoStopAt *time.Time
	if row.StartedAt != nil {
		t := time.Unix(*row.StartedAt, 0)
		startedAt = &t
	}
	if row.StoppedAt != nil {
		t := time.Unix(*row.StoppedAt, 0)
		stoppedAt = &t
	}
	if row.AutoStopAt != nil {
		t := time.Unix(*row.AutoStopAt, 0)
		autoStopAt = &t
	}

	container := &model.Container{
		ID:           row.ID,
		UserID:       row.UserID,
		LabID:        row.LabID,
		ServerID:     row.ServerID,
		ContainerID:  row.ContainerID,
		Status:       row.Status,
		PortMappings: row.PortMappings,
		CPULimit:     row.CPULimit,
		MemoryLimit:  row.MemoryLimit,
		CreatedAt:    createdAt,
		StartedAt:    startedAt,
		StoppedAt:    stoppedAt,
		LastActiveAt: lastActiveAt,
		AutoStopAt:   autoStopAt,
	}

	return container, true
}

func (h *Handler) GetContainer(c *gin.Context) {
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		return
	}
	c.JSON(http.StatusOK, container)
}

func (h *Handler) StartContainer(c *gin.Context) {
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		return
	}

	if container.Status == "running" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Container is already running"})
		return
	}
	if container.Status == "creating" || strings.TrimSpace(container.ContainerID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "容器仍在创建中，请稍候再试"})
		return
	}

	// 调用 Docker API 启动容器
	resp, err := h.dockerRequest(nil, "POST", "/containers/"+container.ContainerID+"/start", nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to start container: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotModified {
		bodyBytes, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to start container: " + string(bodyBytes)})
		return
	}

	// 更新数据库
	now := time.Now()
	updates := map[string]any{
		"status":       "running",
		"startedAt":    now,
		"lastActiveAt": now,
		"autoStopAt":   now.Add(autoStopTimeout()),
		"stoppedAt":    nil,
	}
	if err := h.db.Table("containers").Where("id = ?", container.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Start container failed"})
		return
	}

	// 更新内存中的容器对象
	container.Status = "running"
	container.StartedAt = &now
	container.LastActiveAt = now
	autoStopAt := now.Add(autoStopTimeout())
	container.AutoStopAt = &autoStopAt
	container.StoppedAt = nil

	c.JSON(http.StatusOK, container)
}

func (h *Handler) StopContainer(c *gin.Context) {
	println("[StopContainer] Request received for ID:", c.Param("id"))
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		println("[StopContainer] getOwnedContainer failed")
		return
	}
	println("[StopContainer] Container found:", container.ID, "ContainerID:", container.ContainerID)

	if container.Status == "stopped" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Container is already stopped"})
		return
	}

	// 调用 Docker API 停止容器
	// Use t=5 for faster stop (5 second grace period before force kill)
	resp, err := h.dockerRequest(nil, "POST", "/containers/"+container.ContainerID+"/stop?t=5", nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to stop container: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotModified {
		bodyBytes, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to stop container: " + string(bodyBytes)})
		return
	}

	// 更新数据库
	now := time.Now()
	updates := map[string]any{
		"status":    "stopped",
		"stoppedAt": now,
	}
	if err := h.db.Table("containers").Where("id = ?", container.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Stop container failed"})
		return
	}

	// 更新内存中的容器对象
	container.Status = "stopped"
	container.StoppedAt = &now

	c.JSON(http.StatusOK, container)
}

func (h *Handler) RemoveContainer(c *gin.Context) {
	println("[RemoveContainer] Request received for ID:", c.Param("id"))
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		println("[RemoveContainer] getOwnedContainer failed")
		return
	}
	println("[RemoveContainer] Container found:", container.ID, "ContainerID:", container.ContainerID)

	if strings.TrimSpace(container.ContainerID) != "" {
		// 如果容器正在运行，先停止
		if container.Status == "running" {
			if resp, err := h.dockerRequest(nil, "POST", "/containers/"+container.ContainerID+"/stop", nil, nil); err == nil {
				resp.Body.Close()
			}
		}

		// 调用 Docker API 删除容器
		resp, err := h.dockerRequest(nil, "DELETE", "/containers/"+container.ContainerID+"?force=true", nil, nil)
		if err == nil {
			resp.Body.Close()
		}
	}

	// 从数据库中删除记录
	if err := h.db.Delete(&model.Container{}, "id = ?", container.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Remove container failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container removed successfully"})
}

func (h *Handler) ContainerHeartbeat(c *gin.Context) {
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		return
	}

	now := time.Now()
	if err := h.db.Table("containers").Where("id = ?", container.ID).Updates(map[string]any{
		"lastActiveAt": now,
		"autoStopAt":   now.Add(autoStopTimeout()),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Heartbeat failed"})
		return
	}

	h.db.Table("containers").
		Select("*, cast(createdAt as integer) as createdAt, cast(startedAt as integer) as startedAt, cast(stoppedAt as integer) as stoppedAt, cast(lastActiveAt as integer) as lastActiveAt, cast(autoStopAt as integer) as autoStopAt").
		Where("id = ?", container.ID).
		First(&container)
	c.JSON(http.StatusOK, container)
}

func (h *Handler) ExecContainer(c *gin.Context) {
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		return
	}
	if container.Status != "running" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Container is not running"})
		return
	}

	var req execCommandReq
	if err := c.ShouldBindJSON(&req); err != nil || req.Command == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "command is required"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"output": "[simulated] " + req.Command})
}

func (h *Handler) ExecCreateContainer(c *gin.Context) {
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		return
	}
	if container.Status != "running" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Container is not running"})
		return
	}

	var req execCreateReq
	if err := c.ShouldBindJSON(&req); err != nil || req.Command == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "command is required"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"execId": "exec-" + newID()[:12]})
}

func (h *Handler) ExecStartContainer(c *gin.Context) {
	container, ok := h.getOwnedContainer(c, c.Param("id"))
	if !ok {
		return
	}
	if container.Status != "running" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Container is not running"})
		return
	}

	var req execStartReq
	if err := c.ShouldBindJSON(&req); err != nil || req.ExecID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "execId is required"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"output": "[simulated exec output]", "execId": req.ExecID})
}

// createDockerContainer 在服务器上创建真实的 Docker 容器
func (h *Handler) createDockerContainer(containerID string, container *model.Container, lab *model.Lab, server *model.Server) {
	log := func(msg string, args ...any) {
		println("[CreateContainer]", containerID, fmt.Sprintf(msg, args...))
	}

	log("Starting Docker container creation for lab: %s", lab.Title)

	// 获取用户信息以生成容器名称
	var user model.User
	if err := h.db.Where("id = ?", container.UserID).First(&user).Error; err != nil {
		log("Failed to get user info: %v", err)
		h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(map[string]any{
			"status": "error",
		})
		return
	}

	// 生成容器名称：用户名-随机6位字符
	containerName := generateContainerName(user.Username)
	log("Generated container name: %s", containerName)

	// 构建容器创建请求
	createReq := map[string]any{
		"Image":     lab.DockerImage,
		"Tty":       true,
		"OpenStdin": true,
		"HostConfig": map[string]any{
			"Memory":   lab.MemoryLimit * 1024 * 1024, // MB to bytes
			"NanoCpus": int64(lab.CPULimit * 1e9),     // CPU cores to nanocpus
			"RestartPolicy": map[string]any{
				"Name": lab.RestartPolicy,
			},
		},
	}
	var actualPortMappings *string

	// 解析并添加端口映射
	if lab.PortMappings != nil && *lab.PortMappings != "" {
		var portMappings []map[string]any
		if err := json.Unmarshal([]byte(*lab.PortMappings), &portMappings); err == nil {
			exposedPorts := make(map[string]any)
			portBindings := make(map[string]any)

			for _, pm := range portMappings {
				containerPort := fmt.Sprintf("%v/%s", pm["containerPort"], pm["protocol"])
				exposedPorts[containerPort] = struct{}{}

				hostPort := ""
				if pm["random"] == true {
					// 获取随机可用端口
					availPort, err := h.getAvailablePort(server)
					if err != nil {
						log("Failed to get available port: %v", err)
						continue
					}
					hostPort = fmt.Sprintf("%d", availPort)
					pm["hostPort"] = availPort
				} else {
					hostPort = fmt.Sprintf("%v", pm["hostPort"])
				}

				portBindings[containerPort] = []map[string]string{
					{"HostPort": hostPort},
				}
			}
			if actual, err := json.Marshal(portMappings); err == nil {
				actualStr := string(actual)
				actualPortMappings = &actualStr
			}

			createReq["ExposedPorts"] = exposedPorts
			createReq["HostConfig"].(map[string]any)["PortBindings"] = portBindings
		}
	}

	// 解析并添加环境变量
	if lab.EnvironmentVars != nil && *lab.EnvironmentVars != "" {
		var envVars []map[string]string
		if err := json.Unmarshal([]byte(*lab.EnvironmentVars), &envVars); err == nil {
			env := make([]string, 0, len(envVars))
			for _, ev := range envVars {
				env = append(env, fmt.Sprintf("%s=%s", ev["name"], ev["value"]))
			}
			createReq["Env"] = env
		}
	}

	// 解析并添加卷挂载
	if lab.VolumeMounts != nil && *lab.VolumeMounts != "" {
		var volumeMounts []map[string]string
		if err := json.Unmarshal([]byte(*lab.VolumeMounts), &volumeMounts); err == nil {
			binds := make([]string, 0, len(volumeMounts))
			for _, vm := range volumeMounts {
				bind := fmt.Sprintf("%s:%s", vm["hostPath"], vm["containerPath"])
				if mode, ok := vm["mode"]; ok && mode != "" {
					bind += ":" + mode
				}
				binds = append(binds, bind)
			}
			createReq["HostConfig"].(map[string]any)["Binds"] = binds
		}
	}

	// 调用 Docker API 创建容器（添加容器名称）
	body, _ := json.Marshal(createReq)
	createURL := fmt.Sprintf("/containers/create?name=%s", url.QueryEscape(containerName))
	log("Creating container with URL: %s", createURL)
	resp, err := h.dockerRequest(server, "POST", createURL, bytes.NewReader(body), map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		log("Failed to create container: %v", err)
		h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(map[string]any{
			"status": "error",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log("Docker API returned error: %d - %s", resp.StatusCode, string(bodyBytes))
		h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(map[string]any{
			"status": "error",
		})
		return
	}

	var createResp struct {
		ID       string   `json:"Id"`
		Warnings []string `json:"Warnings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&createResp); err != nil {
		log("Failed to decode create response: %v", err)
		h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(map[string]any{
			"status": "error",
		})
		return
	}

	log("Container created with Docker ID: %s", createResp.ID)

	// 启动容器
	startResp, err := h.dockerRequest(server, "POST", "/containers/"+createResp.ID+"/start", nil, nil)
	if err != nil {
		log("Failed to start container: %v", err)
		h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(map[string]any{
			"status":      "error",
			"containerId": createResp.ID,
		})
		return
	}
	defer startResp.Body.Close()

	if startResp.StatusCode != http.StatusNoContent && startResp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(startResp.Body)
		log("Failed to start container: %d - %s", startResp.StatusCode, string(bodyBytes))
		h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(map[string]any{
			"status":      "error",
			"containerId": createResp.ID,
		})
		return
	}

	log("Container started successfully")

	// 更新数据库记录
	now := time.Now()
	updates := map[string]any{
		"containerId": createResp.ID,
		"status":      "running",
		"startedAt":   now,
	}
	if actualPortMappings != nil {
		updates["portMappings"] = *actualPortMappings
	}
	log("Updating database with containerId: %s", createResp.ID)
	result := h.db.Model(&model.Container{}).Where("id = ?", containerID).Updates(updates)
	if result.Error != nil {
		log("Failed to update database: %v", result.Error)
	} else {
		log("Database updated successfully, rows affected: %d", result.RowsAffected)

		// 验证更新：立即查询数据库
		var verifyContainer model.Container
		if err := h.db.Where("id = ?", containerID).First(&verifyContainer).Error; err != nil {
			log("Failed to verify update: %v", err)
		} else {
			log("Verification: DB containerId = %s, expected = %s", verifyContainer.ContainerID, createResp.ID)
		}
	}

	log("Container creation completed")
}

// getAvailablePort 获取本机 Docker 可用的主机端口
func (h *Handler) getAvailablePort(server *model.Server) (int, error) {
	used := map[int]bool{}
	var containers []model.Container
	_ = h.db.Find(&containers).Error
	for _, ct := range containers {
		if ct.PortMappings == nil || strings.TrimSpace(*ct.PortMappings) == "" {
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

	start := int(30000 + (time.Now().UnixNano() % 20000))
	for i := 0; i < 20000; i++ {
		port := 30000 + ((start - 30000 + i) % 20000)
		if !used[port] {
			return port, nil
		}
	}
	return 0, fmt.Errorf("no available ports in range 30000-49999")
}

// generateContainerName 生成容器名称：用户名-随机6位字符
func generateContainerName(username string) string {
	// 生成6位随机字符（小写字母和数字）
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	random := make([]byte, 6)
	for i := range random {
		random[i] = charset[time.Now().UnixNano()%int64(len(charset))]
		time.Sleep(time.Nanosecond) // 确保每次生成不同的随机数
	}
	return fmt.Sprintf("%s-%s", username, string(random))
}
