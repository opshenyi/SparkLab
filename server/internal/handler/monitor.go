package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"sparklab/server/internal/monitor"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  8192,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
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

	result := make([]gin.H, 0, len(containers))
	for _, container := range containers {
		names := container.Names
		if len(names) > 0 && len(names[0]) > 0 {
			names[0] = names[0][1:] // Remove leading slash
		}

		result = append(result, gin.H{
			"id":      container.ID[:12],
			"name":    names,
			"image":   container.Image,
			"status":  container.Status,
			"state":   container.State,
			"created": container.Created,
			"ports":   container.Ports,
		})
	}

	c.JSON(http.StatusOK, gin.H{"containers": result})
}

// GetDockerContainerStats returns statistics for a specific container
func (h *Handler) GetDockerContainerStats(c *gin.Context) {
	containerID := c.Param("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	stats, err := mon.GetContainerStats(ctx, containerID)
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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	timeout := 10
	var controlErr error

	switch action {
	case "start":
		controlErr = mon.StartContainer(ctx, containerID)
	case "stop":
		controlErr = mon.StopContainer(ctx, containerID, &timeout)
	case "restart":
		controlErr = mon.RestartContainer(ctx, containerID, &timeout)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid action. Use start, stop, or restart"})
		return
	}

	if controlErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to " + action + " container: " + controlErr.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container " + action + " successful", "containerId": containerID})
}

// GetDockerContainerLogs retrieves logs from a container
func (h *Handler) GetDockerContainerLogs(c *gin.Context) {
	containerID := c.Param("id")
	tail := c.DefaultQuery("tail", "100")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	logs, err := mon.GetContainerLogs(ctx, containerID, tail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get logs: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// InspectDockerContainer retrieves detailed container information
func (h *Handler) InspectDockerContainer(c *gin.Context) {
	containerID := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mon, err := monitor.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to initialize monitor"})
		return
	}

	info, err := mon.InspectContainer(ctx, containerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to inspect container: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, info)
}

// StreamDockerContainerStats streams container statistics via WebSocket
func (h *Handler) StreamDockerContainerStats(c *gin.Context) {
	containerID := c.Param("id")

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
			stats, err := mon.GetContainerStats(ctx, containerID)
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
