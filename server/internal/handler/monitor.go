package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"sparklab/server/internal/model"
	"sparklab/server/internal/monitor"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  8192,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

func (h *Handler) managedLocalDockerContainerSet() (map[string]struct{}, error) {
	var rows []model.Container
	if err := h.db.Select("containerId").Where("serverId = ? AND containerId <> ''", localDockerServerID).Find(&rows).Error; err != nil {
		return nil, err
	}

	managed := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		id := strings.TrimSpace(row.ContainerID)
		if id != "" {
			managed[id] = struct{}{}
		}
	}
	return managed, nil
}

func (h *Handler) validateManagedMonitorContainer(containerID string) (*model.Container, int, string) {
	containerID = strings.TrimSpace(containerID)
	if containerID == "" {
		return nil, http.StatusBadRequest, "Container is required"
	}

	var ct model.Container
	err := h.db.Where("containerId = ?", containerID).First(&ct).Error
	if errors.Is(err, gorm.ErrRecordNotFound) && len(containerID) >= 12 {
		var matches []model.Container
		if findErr := h.db.Where("containerId LIKE ?", containerID+"%").Limit(2).Find(&matches).Error; findErr != nil {
			return nil, http.StatusInternalServerError, "Load container failed"
		}
		switch len(matches) {
		case 0:
			return nil, http.StatusNotFound, "Container is not managed by SparkLab"
		case 1:
			ct = matches[0]
			err = nil
		default:
			return nil, http.StatusConflict, "Container id prefix is ambiguous"
		}
	}
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, http.StatusNotFound, "Container is not managed by SparkLab"
		}
		return nil, http.StatusInternalServerError, "Load container failed"
	}

	if ct.ServerID == nil || strings.TrimSpace(*ct.ServerID) != localDockerServerID {
		return nil, http.StatusForbidden, "Container does not belong to local Docker"
	}

	return &ct, http.StatusOK, ""
}

// GetResourceStats returns current system resource statistics
func (h *Handler) GetResourceStats(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	stats, err := mon.GetResourceStats(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get resource stats"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// StreamResourceStats streams resource statistics via WebSocket
func (h *Handler) StreamResourceStats(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	mon, err := monitor.New()
	if err != nil {
		conn.WriteJSON(gin.H{"error": "Failed to initialize monitor"})
		return
	}

	// Get interval from query parameter (default 2 seconds)
	intervalStr := c.DefaultQuery("interval", "2")
	interval, err := strconv.Atoi(intervalStr)
	if err != nil || interval < 1 {
		interval = 2
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Subscribe to updates
	subscriberID := newID()
	updateChan := mon.Subscribe(subscriberID)
	defer mon.Unsubscribe(subscriberID)

	// Start monitoring in background
	go mon.StartMonitoring(ctx, time.Duration(interval)*time.Second)

	// Send initial stats
	stats, _ := mon.GetResourceStats(ctx)
	if stats != nil {
		conn.WriteJSON(stats)
	}

	// Stream updates
	for {
		select {
		case stats, ok := <-updateChan:
			if !ok {
				return
			}
			if err := conn.WriteJSON(stats); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// GetDockerContainers returns list of Docker containers
func (h *Handler) GetDockerContainers(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	containers, err := mon.GetDockerContainers(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get containers: " + err.Error()})
		return
	}

	managedContainers, err := h.managedLocalDockerContainerSet()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Load managed containers failed"})
		return
	}

	result := make([]gin.H, 0, len(containers))
	for _, container := range containers {
		names := append([]string(nil), container.Names...)
		if len(names) > 0 && len(names[0]) > 0 {
			names[0] = names[0][1:] // Remove leading slash
		}
		displayID := container.ID
		if len(displayID) > 12 {
			displayID = displayID[:12]
		}
		_, managed := managedContainers[container.ID]

		result = append(result, gin.H{
			"id":        container.ID,
			"displayId": displayID,
			"managed":   managed,
			"name":      names,
			"image":     container.Image,
			"status":    container.Status,
			"state":     container.State,
			"created":   container.Created,
			"ports":     container.Ports,
		})
	}

	c.JSON(http.StatusOK, gin.H{"containers": result})
}

// GetDockerContainerStats returns statistics for a specific container
func (h *Handler) GetDockerContainerStats(c *gin.Context) {
	containerID := c.Param("id")
	ct, status, message := h.validateManagedMonitorContainer(containerID)
	if status != http.StatusOK {
		c.JSON(status, gin.H{"message": message})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	stats, err := mon.GetContainerStats(ctx, ct.ContainerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get container stats: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// ControlDockerContainer handles start/stop/restart operations
func (h *Handler) ControlDockerContainer(c *gin.Context) {
	containerID := c.Param("id")
	action := c.Param("action")
	if action != "start" && action != "stop" && action != "restart" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid action. Use start, stop, or restart"})
		return
	}

	ct, status, message := h.validateManagedMonitorContainer(containerID)
	if status != http.StatusOK {
		c.JSON(status, gin.H{"message": message})
		return
	}

	s, ok := h.findServerForAdmin(localDockerServerID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"message": "Server not found"})
		return
	}

	var dockerPath string
	switch action {
	case "start":
		dockerPath = "/containers/" + url.PathEscape(ct.ContainerID) + "/start"
	case "stop":
		dockerPath = "/containers/" + url.PathEscape(ct.ContainerID) + "/stop?t=5"
	case "restart":
		dockerPath = "/containers/" + url.PathEscape(ct.ContainerID) + "/restart?t=5"
	}

	resp, err := h.dockerRequest(s, http.MethodPost, dockerPath, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to " + action + " container: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotModified {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Failed to " + action + " container: " + readDockerError(resp)})
		return
	}

	now := time.Now()
	updates := map[string]any{}
	switch action {
	case "start", "restart":
		updates = map[string]any{
			"status":       "running",
			"startedAt":    now,
			"lastActiveAt": now,
			"autoStopAt":   now.Add(autoStopTimeout()),
			"stoppedAt":    nil,
		}
	case "stop":
		updates = map[string]any{
			"status":     "stopped",
			"stoppedAt":  now,
			"autoStopAt": nil,
		}
	}
	if err := h.db.Model(&model.Container{}).Where("id = ?", ct.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Update container state failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container " + action + " successful", "containerId": ct.ContainerID})
}

// GetDockerContainerLogs retrieves logs from a container
func (h *Handler) GetDockerContainerLogs(c *gin.Context) {
	containerID := c.Param("id")
	tail := c.DefaultQuery("tail", "100")
	ct, status, message := h.validateManagedMonitorContainer(containerID)
	if status != http.StatusOK {
		c.JSON(status, gin.H{"message": message})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	logs, err := mon.GetContainerLogs(ctx, ct.ContainerID, tail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get logs: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// InspectDockerContainer retrieves detailed container information
func (h *Handler) InspectDockerContainer(c *gin.Context) {
	containerID := c.Param("id")
	ct, status, message := h.validateManagedMonitorContainer(containerID)
	if status != http.StatusOK {
		c.JSON(status, gin.H{"message": message})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	info, err := mon.InspectContainer(ctx, ct.ContainerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to inspect container: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, info)
}

// StreamDockerContainerStats streams container statistics via WebSocket
func (h *Handler) StreamDockerContainerStats(c *gin.Context) {
	containerID := c.Param("id")
	ct, status, message := h.validateManagedMonitorContainer(containerID)
	if status != http.StatusOK {
		c.JSON(status, gin.H{"message": message})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	mon, err := monitor.New()
	if err != nil {
		conn.WriteJSON(gin.H{"error": "Failed to initialize monitor"})
		return
	}

	// Get interval from query parameter (default 2 seconds)
	intervalStr := c.DefaultQuery("interval", "2")
	interval, err := strconv.Atoi(intervalStr)
	if err != nil || interval < 1 {
		interval = 2
	}

	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for {
		select {
		case <-ticker.C:
			stats, err := mon.GetContainerStats(ctx, ct.ContainerID)
			if err != nil {
				conn.WriteJSON(gin.H{"error": err.Error()})
				return
			}

			data, _ := json.Marshal(stats)
			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
