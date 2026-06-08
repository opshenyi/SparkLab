package handler

import (
	"archive/tar"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const localDockerServerID = "local-docker"

type dockerImageSummary struct {
	ID       string   `json:"Id"`
	RepoTags []string `json:"RepoTags"`
	Size     int64    `json:"Size"`
	Created  int64    `json:"Created"`
}

type dockerContainerSummary struct {
	ID      string   `json:"Id"`
	Image   string   `json:"Image"`
	State   string   `json:"State"`
	Created int64    `json:"Created"`
	Names   []string `json:"Names"`
	Ports   []any    `json:"Ports"`
}

func (h *Handler) dockerBaseURL(server *model.Server) (string, error) {
	if strings.TrimSpace(h.dockerAPIBaseURL) == "" {
		return "", fmt.Errorf("docker host is not configured")
	}
	return h.dockerAPIBaseURL, nil
}

func (h *Handler) dockerRequest(server *model.Server, method, path string, body io.Reader, headers map[string]string) (*http.Response, error) {
	base, err := h.dockerBaseURL(server)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(method, base+path, body)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return h.dockerHTTP.Do(req)
}

func readDockerError(resp *http.Response) string {
	b, _ := io.ReadAll(resp.Body)
	if len(b) == 0 {
		return fmt.Sprintf("docker api status %d", resp.StatusCode)
	}
	return strings.TrimSpace(string(b))
}

type dockerInfo struct {
	NCPU              int    `json:"NCPU"`
	MemTotal          int64  `json:"MemTotal"`
	Name              string `json:"Name"`
	Containers        int    `json:"Containers"`
	ContainersRunning int    `json:"ContainersRunning"`
	ServerVersion     string `json:"ServerVersion"`
	OperatingSystem   string `json:"OperatingSystem"`
	KernelVersion     string `json:"KernelVersion"`
	Architecture      string `json:"Architecture"`
}

type dockerContainerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
	} `json:"memory_stats"`
}

func (h *Handler) updateServerStats(server *model.Server) {
	resp, err := h.dockerRequest(server, http.MethodGet, "/info", nil, nil)
	if err != nil {
		h.db.Model(&model.Server{}).Where("id = ?", server.ID).Updates(map[string]any{
			"status":      "offline",
			"lastCheckAt": time.Now(),
			"updatedAt":   time.Now(),
		})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		h.db.Model(&model.Server{}).Where("id = ?", server.ID).Updates(map[string]any{
			"status":      "error",
			"lastCheckAt": time.Now(),
			"updatedAt":   time.Now(),
		})
		return
	}

	var info dockerInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		h.db.Model(&model.Server{}).Where("id = ?", server.ID).Updates(map[string]any{
			"status":      "error",
			"lastCheckAt": time.Now(),
			"updatedAt":   time.Now(),
		})
		return
	}

	runningCount, _, err := h.listContainerCounts(server)
	if err != nil {
		runningCount = info.ContainersRunning
	}

	cpuModel := strings.TrimSpace(info.Name)
	if cpuModel == "" {
		cpuModel = "Docker Engine"
	}

	updates := map[string]any{
		"status":           "online",
		"cpuCores":         info.NCPU,
		"cpuModel":         cpuModel,
		"totalMemory":      int(info.MemTotal / 1024 / 1024),
		"activeContainers": runningCount,
		"cpuUsage":         0,
		"memoryUsage":      0,
		"lastCheckAt":      time.Now(),
		"updatedAt":        time.Now(),
	}

	h.db.Model(&model.Server{}).Where("id = ?", server.ID).Updates(updates)
}

// ensureAgentContainer ensures the monitoring agent container exists and is running
func (h *Handler) ensureAgentContainer(server *model.Server, image, name string) (string, error) {
	// Check if container exists
	id, state, found, err := h.findContainerByName(server, name)
	if err != nil {
		return "", err
	}

	if !found {
		// Create new agent container
		id, err = h.createAgentContainer(server, image, name)
		if err != nil {
			return "", err
		}
		// Start the container
		if err := h.startDockerContainer(server, id); err != nil {
			return "", err
		}
		return id, nil
	}

	// If found but not running, start it
	if !strings.EqualFold(state, "running") {
		if err := h.startDockerContainer(server, id); err != nil {
			return "", err
		}
	}

	return id, nil
}

// findContainerByName finds a container by name
func (h *Handler) findContainerByName(server *model.Server, name string) (id string, state string, found bool, err error) {
	resp, err := h.dockerRequest(server, http.MethodGet, "/containers/json?all=1", nil, nil)
	if err != nil {
		return "", "", false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", "", false, fmt.Errorf("list containers failed: %s", readDockerError(resp))
	}

	var containers []dockerContainerSummary
	if err := json.NewDecoder(resp.Body).Decode(&containers); err != nil {
		return "", "", false, err
	}

	target := "/" + name
	for _, ct := range containers {
		for _, n := range ct.Names {
			if n == target || n == name {
				return ct.ID, ct.State, true, nil
			}
		}
	}

	return "", "", false, nil
}

// createAgentContainer creates a monitoring agent container
func (h *Handler) createAgentContainer(server *model.Server, image, name string) (string, error) {
	reqBody := map[string]any{
		"Image": image,
		"Tty":   true,
		"Cmd":   []string{"sh", "-c", "while true; do sleep 3600; done"},
		"HostConfig": map[string]any{
			"Binds":       []string{"/proc:/host/proc:ro"},
			"NetworkMode": "none",
		},
	}
	j, _ := json.Marshal(reqBody)

	path := "/containers/create?name=" + url.QueryEscape(name)
	resp, err := h.dockerRequest(server, http.MethodPost, path, bytes.NewReader(j), map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	// If image not found, try to pull it first
	if resp.StatusCode == 404 {
		body, _ := io.ReadAll(resp.Body)
		if strings.Contains(strings.ToLower(string(body)), "no such image") {
			if err := h.pullImage(server, image); err != nil {
				return "", err
			}
			// Retry creation
			resp, err = h.dockerRequest(server, http.MethodPost, path, bytes.NewReader(j), map[string]string{
				"Content-Type": "application/json",
			})
			if err != nil {
				return "", err
			}
			defer resp.Body.Close()
		}
	}

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("create agent container failed: %s", readDockerError(resp))
	}

	var result struct {
		ID string `json:"Id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.ID, nil
}

// pullImage pulls a Docker image
func (h *Handler) pullImage(server *model.Server, image string) error {
	path := "/images/create?fromImage=" + url.QueryEscape(image)
	resp, err := h.dockerRequest(server, http.MethodPost, path, nil, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("pull image failed: %s", readDockerError(resp))
	}

	return nil
}

// startDockerContainer starts a container
func (h *Handler) startDockerContainer(server *model.Server, containerID string) error {
	resp, err := h.dockerRequest(server, http.MethodPost, "/containers/"+containerID+"/start", nil, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode != 304 { // 304 means already started
		return fmt.Errorf("start container failed: %s", readDockerError(resp))
	}

	return nil
}

// collectHostSnapshot collects system information from the host via agent container
func (h *Handler) collectHostSnapshot(server *model.Server, agentContainerID string) (cpuLine string, memBlock string, cpuInfoBlock string, err error) {
	out, err := h.execInContainer(server, agentContainerID, []string{"sh", "-c", `cat /host/proc/stat; echo "__MEM__"; cat /host/proc/meminfo; echo "__CPUINFO__"; cat /host/proc/cpuinfo`})
	if err != nil {
		return "", "", "", err
	}

	parts := strings.Split(out, "__MEM__")
	if len(parts) != 2 {
		return "", "", "", fmt.Errorf("unexpected output: missing __MEM__")
	}
	parts2 := strings.Split(parts[1], "__CPUINFO__")
	if len(parts2) != 2 {
		return "", "", "", fmt.Errorf("unexpected output: missing __CPUINFO__")
	}

	// Find CPU line
	for _, l := range strings.Split(parts[0], "\n") {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, "cpu ") {
			cpuLine = l
			break
		}
	}

	if cpuLine == "" {
		return "", "", "", fmt.Errorf("cpu line not found")
	}

	memBlock = parts2[0]
	cpuInfoBlock = parts2[1]
	return cpuLine, memBlock, cpuInfoBlock, nil
}

// execInContainer executes a command in a container
func (h *Handler) execInContainer(server *model.Server, containerID string, cmd []string) (string, error) {
	reqBody := map[string]any{
		"AttachStdout": true,
		"AttachStderr": true,
		"Tty":          true,
		"Cmd":          cmd,
	}
	j, _ := json.Marshal(reqBody)

	resp, err := h.dockerRequest(server, http.MethodPost, "/containers/"+containerID+"/exec", bytes.NewReader(j), map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("create exec failed: %s", readDockerError(resp))
	}

	var execResp struct {
		ID string `json:"Id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&execResp); err != nil {
		return "", err
	}

	// Start exec
	startBody := map[string]any{
		"Detach": false,
		"Tty":    true,
	}
	startJSON, _ := json.Marshal(startBody)

	startResp, err := h.dockerRequest(server, http.MethodPost, "/exec/"+execResp.ID+"/start", bytes.NewReader(startJSON), map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		return "", err
	}
	defer startResp.Body.Close()

	if startResp.StatusCode >= 400 {
		return "", fmt.Errorf("start exec failed: %s", readDockerError(startResp))
	}

	out, err := io.ReadAll(startResp.Body)
	if err != nil {
		return "", err
	}

	return string(out), nil
}

// parseCPUModel extracts CPU model from cpuinfo
func (h *Handler) parseCPUModel(cpuInfo string) string {
	for _, line := range strings.Split(cpuInfo, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToLower(line), "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "unknown"
}

// countCPUCores counts the number of CPU cores from cpuinfo
func (h *Handler) countCPUCores(cpuInfo string) int {
	count := 0
	for _, line := range strings.Split(cpuInfo, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "processor") {
			count++
		}
	}
	if count == 0 {
		return 1
	}
	return count
}

// parseCPUStat parses CPU stat line from /proc/stat
func (h *Handler) parseCPUStat(line string) (idle, total uint64, err error) {
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, fmt.Errorf("invalid cpu stat line: %s", line)
	}

	var nums []uint64
	for _, f := range fields[1:] {
		v, e := strconv.ParseUint(f, 10, 64)
		if e != nil {
			return 0, 0, e
		}
		nums = append(nums, v)
	}

	for _, v := range nums {
		total += v
	}

	// idle is the 4th field (index 3)
	idle = nums[3]
	// iowait is the 5th field (index 4) if available
	if len(nums) > 4 {
		idle += nums[4]
	}

	return idle, total, nil
}

// parseMemInfo parses memory information from /proc/meminfo
func (h *Handler) parseMemInfo(memText string) (usedPercent float64, totalKB uint64, err error) {
	var total, available, free, buffers, cached uint64

	for _, line := range strings.Split(memText, "\n") {
		fs := strings.Fields(line)
		if len(fs) < 2 {
			continue
		}
		key := strings.TrimSuffix(fs[0], ":")
		val, e := strconv.ParseUint(fs[1], 10, 64)
		if e != nil {
			continue
		}

		switch key {
		case "MemTotal":
			total = val
		case "MemAvailable":
			available = val
		case "MemFree":
			free = val
		case "Buffers":
			buffers = val
		case "Cached":
			cached = val
		}
	}

	if total == 0 {
		return 0, 0, fmt.Errorf("MemTotal not found")
	}

	var used uint64
	if available > 0 {
		used = total - available
	} else {
		used = total - (free + buffers + cached)
	}

	return float64(used) * 100.0 / float64(total), total, nil
}

// listContainerCounts returns the number of running and total containers
func (h *Handler) listContainerCounts(server *model.Server) (running int, total int, err error) {
	resp, err := h.dockerRequest(server, http.MethodGet, "/containers/json?all=1", nil, nil)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return 0, 0, fmt.Errorf("list containers failed: %s", readDockerError(resp))
	}

	var containers []dockerContainerSummary
	if err := json.NewDecoder(resp.Body).Decode(&containers); err != nil {
		return 0, 0, err
	}

	total = len(containers)
	for _, c := range containers {
		if strings.EqualFold(c.State, "running") {
			running++
		}
	}

	log.Printf("[DEBUG] Server %s (%s:%d) - Running: %d, Total: %d", server.Name, server.Host, server.Port, running, total)

	return running, total, nil
}

func (h *Handler) findServerForAdmin(id string) (*model.Server, bool) {
	s, err := h.ensureLocalDockerServer()
	if err != nil {
		return nil, false
	}
	return s, true
}

func (h *Handler) findContainerByServer(serverID, containerID string) (*model.Container, bool) {
	var ct model.Container
	if err := h.db.Where("serverId = ? AND containerId = ?", serverID, containerID).First(&ct).Error; err != nil {
		return nil, false
	}
	return &ct, true
}

type createServerReq struct {
	Name string `json:"name"`
	Host string `json:"host"`
	Port int    `json:"port"`
}

type updateServerReq struct {
	Name          *string  `json:"name"`
	Status        *string  `json:"status"`
	MaxContainers *int     `json:"maxContainers"`
	CPUCores      *int     `json:"cpuCores"`
	CPUModel      *string  `json:"cpuModel"`
	TotalMemory   *int     `json:"totalMemory"`
	CPUUsage      *float64 `json:"cpuUsage"`
	MemoryUsage   *float64 `json:"memoryUsage"`
}

type pullImageReq struct {
	ImageName string `json:"imageName"`
	Tag       string `json:"tag"`
}

type buildImageReq struct {
	Dockerfile string `json:"dockerfile"`
	ImageName  string `json:"imageName"`
	Tag        string `json:"tag"`
}

func randomToken32() string {
	id := newID() + newID()
	if len(id) >= 32 {
		return id[:32]
	}
	return fmt.Sprintf("%032s", id)
}

func (h *Handler) ensureLocalDockerServer() (*model.Server, error) {
	now := time.Now()
	host := strings.TrimSpace(h.cfg.DockerHost)
	if host == "" {
		host = "unix:///var/run/docker.sock"
	}

	var server model.Server
	err := h.db.Where("id = ?", localDockerServerID).First(&server).Error
	if err == nil {
		updates := map[string]any{
			"host":       host,
			"port":       0,
			"username":   "",
			"authType":   "local-unix",
			"password":   nil,
			"privateKey": nil,
			"updatedAt":  now,
		}
		if strings.TrimSpace(server.Name) == "" {
			updates["name"] = "本机 Docker"
		}
		if server.MaxContainers <= 0 {
			updates["maxContainers"] = 100
		}
		if err := h.db.Model(&server).Updates(updates).Error; err != nil {
			return nil, err
		}
		if err := h.db.Where("id = ?", localDockerServerID).First(&server).Error; err != nil {
			return nil, err
		}
		return &server, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	server = model.Server{
		ID:               localDockerServerID,
		Name:             "本机 Docker",
		Host:             host,
		Port:             0,
		Username:         "",
		AuthType:         "local-unix",
		Password:         nil,
		PrivateKey:       nil,
		Status:           "offline",
		LastCheckAt:      now,
		MaxContainers:    100,
		CPUCores:         0,
		TotalMemory:      0,
		ActiveContainers: 0,
		CPUUsage:         0,
		MemoryUsage:      0,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := h.db.Create(&server).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

func (h *Handler) CreateServer(c *gin.Context) {
	server, err := h.ensureLocalDockerServer()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Prepare local Docker node failed"})
		return
	}
	h.updateServerStats(server)
	c.JSON(http.StatusOK, gin.H{
		"id":               server.ID,
		"name":             server.Name,
		"host":             server.Host,
		"port":             server.Port,
		"username":         server.Username,
		"authType":         server.AuthType,
		"status":           server.Status,
		"lastCheckAt":      server.LastCheckAt,
		"maxContainers":    server.MaxContainers,
		"cpuCores":         server.CPUCores,
		"cpuModel":         server.CPUModel,
		"totalMemory":      server.TotalMemory,
		"activeContainers": server.ActiveContainers,
		"cpuUsage":         server.CPUUsage,
		"memoryUsage":      server.MemoryUsage,
		"createdAt":        server.CreatedAt,
		"updatedAt":        server.UpdatedAt,
	})
}

func (h *Handler) GetServers(c *gin.Context) {
	local, err := h.ensureLocalDockerServer()
	if err != nil {
		log.Printf("[ERROR] Failed to load servers: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load servers failed"})
		return
	}

	servers := []model.Server{*local}

	// Update stats for each server synchronously on first load
	// Use a channel to wait for all updates to complete with timeout
	type updateResult struct {
		serverID string
		done     bool
	}

	resultChan := make(chan updateResult, len(servers))

	for i := range servers {
		go func(serverID string) {
			var s model.Server
			if err := h.db.Where("id = ?", serverID).First(&s).Error; err == nil {
				h.updateServerStats(&s)
			}
			resultChan <- updateResult{serverID: serverID, done: true}
		}(servers[i].ID)
	}

	// Wait for all updates to complete or timeout after 3 seconds
	timeout := time.After(3 * time.Second)
	completed := 0
	for completed < len(servers) {
		select {
		case <-resultChan:
			completed++
		case <-timeout:
			log.Printf("[WARN] Server stats update timeout, returning partial results")
			goto buildResponse
		}
	}

buildResponse:
	// Reload servers from database to get updated stats
	if refreshed, err := h.ensureLocalDockerServer(); err == nil {
		servers = []model.Server{*refreshed}
	}

	resp := make([]gin.H, 0, len(servers))
	for _, s := range servers {
		// Check if server is stale (no update in last 10 seconds)
		status := s.Status
		if status == "online" && time.Since(s.LastCheckAt).Seconds() > 10 {
			status = "offline"
		}

		totalContainers := s.ActiveContainers
		if _, total, err := h.listContainerCounts(&s); err == nil {
			totalContainers = total
		}

		// Get container count from database
		var containerCount int64
		h.db.Model(&model.Container{}).Where("serverId = ?", s.ID).Count(&containerCount)

		resp = append(resp, gin.H{
			"id":               s.ID,
			"name":             s.Name,
			"host":             s.Host,
			"port":             s.Port,
			"username":         s.Username,
			"authType":         s.AuthType,
			"status":           status,
			"lastCheckAt":      s.LastCheckAt.Unix(),
			"maxContainers":    s.MaxContainers,
			"cpuCores":         s.CPUCores,
			"cpuModel":         s.CPUModel,
			"totalMemory":      s.TotalMemory,
			"activeContainers": s.ActiveContainers,
			"totalContainers":  totalContainers,
			"cpuUsage":         s.CPUUsage,
			"memoryUsage":      s.MemoryUsage,
			"createdAt":        s.CreatedAt.Unix(),
			"updatedAt":        s.UpdatedAt.Unix(),
			"_count": gin.H{
				"containers": containerCount,
			},
		})
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) GetServer(c *gin.Context) {
	s, ok := h.findServerForAdmin(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *Handler) GetServerContainers(c *gin.Context) {
	id := c.Param("id")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	// Update server stats before returning containers
	h.updateServerStats(s)

	dockerResp, err := h.dockerRequest(s, http.MethodGet, "/containers/json?all=1", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to list containers: " + err.Error()})
		return
	}
	defer dockerResp.Body.Close()
	if dockerResp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to list containers: " + readDockerError(dockerResp)})
		return
	}

	var containers []dockerContainerSummary
	if err := json.NewDecoder(dockerResp.Body).Decode(&containers); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to parse containers response"})
		return
	}

	containerResp := make([]gin.H, 0, len(containers))
	for _, ct := range containers {
		name := ct.ID
		if len(ct.Names) > 0 {
			name = strings.TrimPrefix(ct.Names[0], "/")
		}
		containerResp = append(containerResp, gin.H{
			"id":      ct.ID,
			"name":    name,
			"image":   ct.Image,
			"status":  ct.State,
			"created": time.Unix(ct.Created, 0).UTC().Format(time.RFC3339),
			"ports":   ct.Ports,
		})
	}
	c.JSON(http.StatusOK, gin.H{"containers": containerResp})
}

func (h *Handler) StartServerContainer(c *gin.Context) {
	serverID := c.Param("id")
	containerID := c.Param("containerId")
	s, ok := h.findServerForAdmin(serverID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	// Try to start the container directly via Docker API
	// No need to check database - this works for both DB containers and system containers
	resp, err := h.dockerRequest(s, http.MethodPost, "/containers/"+url.PathEscape(containerID)+"/start", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to start container: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != 304 { // 304 means already started
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to start container: " + readDockerError(resp)})
		return
	}

	// Update database if this container exists in DB
	now := time.Now()
	h.db.Model(&model.Container{}).Where("serverId = ? AND containerId = ?", serverID, containerID).Updates(map[string]any{
		"status":       "running",
		"startedAt":    now,
		"lastActiveAt": now,
		"stoppedAt":    nil,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Container started successfully"})
}

func (h *Handler) StopServerContainer(c *gin.Context) {
	serverID := c.Param("id")
	containerID := c.Param("containerId")
	s, ok := h.findServerForAdmin(serverID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	// Try to stop the container directly via Docker API
	// No need to check database - this works for both DB containers and system containers
	// Use t=5 for faster stop (5 second grace period before force kill)
	resp, err := h.dockerRequest(s, http.MethodPost, "/containers/"+url.PathEscape(containerID)+"/stop?t=5", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to stop container: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != 304 { // 304 means already stopped
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to stop container: " + readDockerError(resp)})
		return
	}

	// Update database if this container exists in DB
	now := time.Now()
	h.db.Model(&model.Container{}).Where("serverId = ? AND containerId = ?", serverID, containerID).Updates(map[string]any{
		"status":    "stopped",
		"stoppedAt": now,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Container stopped successfully"})
}

func (h *Handler) RemoveServerContainer(c *gin.Context) {
	serverID := c.Param("id")
	containerID := c.Param("containerId")
	s, ok := h.findServerForAdmin(serverID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	// Try to remove the container directly via Docker API
	// No need to check database - this works for both DB containers and system containers
	resp, err := h.dockerRequest(s, http.MethodDelete, "/containers/"+url.PathEscape(containerID)+"?force=1", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to remove container: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != 404 { // 404 means already removed
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to remove container: " + readDockerError(resp)})
		return
	}

	// Remove from database if this container exists in DB
	h.db.Delete(&model.Container{}, "serverId = ? AND containerId = ?", serverID, containerID)

	c.JSON(http.StatusOK, gin.H{"message": "Container removed successfully"})
}

func (h *Handler) GetServerImages(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		id = c.Param("serverId")
	}
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	resp, err := h.dockerRequest(s, http.MethodGet, "/images/json", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to list images: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to list images: " + readDockerError(resp)})
		return
	}

	var images []dockerImageSummary
	if err := json.NewDecoder(resp.Body).Decode(&images); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to parse images response"})
		return
	}
	out := make([]gin.H, 0, len(images))
	for _, img := range images {
		out = append(out, gin.H{
			"id":      img.ID,
			"tags":    img.RepoTags,
			"size":    img.Size,
			"created": time.Unix(img.Created, 0).UTC().Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, gin.H{"images": out})
}

func (h *Handler) PullServerImage(c *gin.Context) {
	id := c.Param("id")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	var req pullImageReq
	if err := c.ShouldBindJSON(&req); err != nil || req.ImageName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "imageName is required"})
		return
	}
	tag := req.Tag
	if tag == "" {
		tag = "latest"
	}
	path := "/images/create?fromImage=" + url.QueryEscape(req.ImageName) + "&tag=" + url.QueryEscape(tag)
	resp, err := h.dockerRequest(s, http.MethodPost, path, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to pull image: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	logs := []string{}
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			logs = append(logs, line)
		}
	}
	if resp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to pull image", "logs": logs})
		return
	}
	if len(logs) == 0 {
		logs = []string{"pull completed"}
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "Image pulled successfully",
		"image":   req.ImageName + ":" + tag,
		"logs":    logs,
	})
}

func (h *Handler) BuildServerImage(c *gin.Context) {
	id := c.Param("id")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	var req buildImageReq
	if err := c.ShouldBindJSON(&req); err != nil || req.ImageName == "" || req.Dockerfile == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "dockerfile and imageName are required"})
		return
	}
	tag := req.Tag
	if tag == "" {
		tag = "latest"
	}

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	content := []byte(req.Dockerfile)
	hdr := &tar.Header{Name: "Dockerfile", Mode: 0644, Size: int64(len(content))}
	if err := tw.WriteHeader(hdr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to build context"})
		return
	}
	if _, err := tw.Write(content); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to build context"})
		return
	}
	if err := tw.Close(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to build context"})
		return
	}

	buildPath := "/build?t=" + url.QueryEscape(req.ImageName+":"+tag) + "&rm=1&forcerm=1"
	resp, err := h.dockerRequest(s, http.MethodPost, buildPath, bytes.NewReader(buf.Bytes()), map[string]string{
		"Content-Type": "application/x-tar",
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to build image: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	logs := []string{}
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			logs = append(logs, line)
		}
	}
	if resp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to build image", "logs": logs})
		return
	}
	if len(logs) == 0 {
		logs = []string{"build completed"}
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "Image built successfully",
		"image":   req.ImageName + ":" + tag,
		"logs":    logs,
	})
}

func (h *Handler) RemoveServerImage(c *gin.Context) {
	id := c.Param("id")
	imageID := c.Param("imageId")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	resp, err := h.dockerRequest(s, http.MethodDelete, "/images/"+url.PathEscape(imageID)+"?force=1", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to remove image: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to remove image: " + readDockerError(resp)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Image removed successfully"})
}

func (h *Handler) UpdateServer(c *gin.Context) {
	id := c.Param("id")
	var req updateServerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	updates := map[string]any{"updatedAt": time.Now()}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.MaxContainers != nil {
		updates["maxContainers"] = *req.MaxContainers
	}
	if req.CPUCores != nil {
		updates["cpuCores"] = *req.CPUCores
	}
	if req.CPUModel != nil {
		updates["cpuModel"] = *req.CPUModel
	}
	if req.TotalMemory != nil {
		updates["totalMemory"] = *req.TotalMemory
	}
	if req.CPUUsage != nil {
		updates["cpuUsage"] = *req.CPUUsage
	}
	if req.MemoryUsage != nil {
		updates["memoryUsage"] = *req.MemoryUsage
	}

	if err := h.db.Model(&model.Server{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Update server failed"})
		return
	}

	var s model.Server
	h.db.Where("id = ?", id).First(&s)
	c.JSON(http.StatusOK, s)
}

func (h *Handler) DeleteServer(c *gin.Context) {
	c.JSON(http.StatusBadRequest, gin.H{"message": "SparkLab uses the local Docker socket only. The local Docker node cannot be deleted."})
}

func (h *Handler) RefreshServerStats(c *gin.Context) {
	id := c.Param("id")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	h.updateServerStats(s)

	// Reload server data
	if err := h.db.Where("id = ?", id).First(s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to reload server"})
		return
	}

	c.JSON(http.StatusOK, s)
}

// Docker Network Management

type dockerNetwork struct {
	ID         string                 `json:"Id"`
	Name       string                 `json:"Name"`
	Driver     string                 `json:"Driver"`
	Scope      string                 `json:"Scope"`
	Created    string                 `json:"Created"`
	IPAM       map[string]interface{} `json:"IPAM"`
	EnableIPv6 bool                   `json:"EnableIPv6"`
	Internal   bool                   `json:"Internal"`
	Attachable bool                   `json:"Attachable"`
	Ingress    bool                   `json:"Ingress"`
	ConfigOnly bool                   `json:"ConfigOnly"`
	Containers map[string]interface{} `json:"Containers"`
	Options    map[string]string      `json:"Options"`
	Labels     map[string]string      `json:"Labels"`
}

type createNetworkReq struct {
	Name        string `json:"name"`
	Driver      string `json:"driver"`
	Subnet      string `json:"subnet"`
	Gateway     string `json:"gateway"`
	IPRange     string `json:"ipRange"`
	ExcludeIps  string `json:"excludeIps"`
	EnableIPv6  bool   `json:"enableIPv6"`
	IPv6Subnet  string `json:"ipv6Subnet"`
	IPv6Gateway string `json:"ipv6Gateway"`
	Options     string `json:"options"`
	Labels      string `json:"labels"`
}

func (h *Handler) GetServerNetworks(c *gin.Context) {
	id := c.Param("id")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	resp, err := h.dockerRequest(s, http.MethodGet, "/networks", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to list networks: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to list networks: " + readDockerError(resp)})
		return
	}

	var networks []dockerNetwork
	if err := json.NewDecoder(resp.Body).Decode(&networks); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to parse networks response"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"networks": networks})
}

func (h *Handler) CreateServerNetwork(c *gin.Context) {
	id := c.Param("id")
	s, ok := h.findServerForAdmin(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	var req createNetworkReq
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "name is required"})
		return
	}

	if req.Driver == "" {
		req.Driver = "bridge"
	}

	reqBody := map[string]interface{}{
		"Name":   req.Name,
		"Driver": req.Driver,
	}

	// Parse options from textarea format (key=value per line)
	if req.Options != "" {
		options := make(map[string]string)
		lines := strings.Split(strings.TrimSpace(req.Options), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				options[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
			}
		}
		if len(options) > 0 {
			reqBody["Options"] = options
		}
	}

	// Parse labels from textarea format (key=value per line)
	if req.Labels != "" {
		labels := make(map[string]string)
		lines := strings.Split(strings.TrimSpace(req.Labels), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				labels[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
			}
		}
		if len(labels) > 0 {
			reqBody["Labels"] = labels
		}
	}

	// Build IPAM configuration
	var ipamConfigs []map[string]interface{}

	// IPv4 configuration
	if req.Subnet != "" {
		ipv4Config := map[string]interface{}{
			"Subnet": req.Subnet,
		}
		if req.Gateway != "" {
			ipv4Config["Gateway"] = req.Gateway
		}
		if req.IPRange != "" {
			ipv4Config["IPRange"] = req.IPRange
		}
		// Parse exclude IPs (comma-separated)
		if req.ExcludeIps != "" {
			excludeIps := []string{}
			ips := strings.Split(req.ExcludeIps, ",")
			for _, ip := range ips {
				ip = strings.TrimSpace(ip)
				if ip != "" {
					excludeIps = append(excludeIps, ip)
				}
			}
			if len(excludeIps) > 0 {
				ipv4Config["AuxiliaryAddresses"] = map[string]string{}
				for i, ip := range excludeIps {
					ipv4Config["AuxiliaryAddresses"].(map[string]string)[fmt.Sprintf("exclude-%d", i)] = ip
				}
			}
		}
		ipamConfigs = append(ipamConfigs, ipv4Config)
	}

	// IPv6 configuration
	if req.EnableIPv6 && req.IPv6Subnet != "" {
		ipv6Config := map[string]interface{}{
			"Subnet": req.IPv6Subnet,
		}
		if req.IPv6Gateway != "" {
			ipv6Config["Gateway"] = req.IPv6Gateway
		}
		ipamConfigs = append(ipamConfigs, ipv6Config)
		reqBody["EnableIPv6"] = true
	}

	// Add IPAM config if any configs exist
	if len(ipamConfigs) > 0 {
		reqBody["IPAM"] = map[string]interface{}{
			"Config": ipamConfigs,
		}
	}

	j, _ := json.Marshal(reqBody)
	resp, err := h.dockerRequest(s, http.MethodPost, "/networks/create", bytes.NewReader(j), map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to create network: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to create network: " + readDockerError(resp)})
		return
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to parse response"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) RemoveServerNetwork(c *gin.Context) {
	serverID := c.Param("id")
	networkID := c.Param("networkId")
	s, ok := h.findServerForAdmin(serverID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	resp, err := h.dockerRequest(s, http.MethodDelete, "/networks/"+url.PathEscape(networkID), nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to remove network: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != 404 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to remove network: " + readDockerError(resp)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Network removed successfully"})
}
