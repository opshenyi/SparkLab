package handler

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"sparklab/server/internal/model"

	"github.com/docker/docker/api/types/container"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// ContainerTerminal handles WebSocket terminal connections to containers
func (h *Handler) ContainerTerminal(c *gin.Context) {
	// 获取参数
	serverID := c.Param("id")
	containerID := c.Param("containerId")

	log.Printf("Terminal connection request: server=%s, container=%s", serverID, containerID)

	dbContainer, statusCode, message := h.validateAdminTerminalContainer(serverID, containerID)
	if statusCode != http.StatusOK {
		log.Printf("Rejected terminal connection: server=%s, container=%s, reason=%s", serverID, containerID, message)
		c.JSON(statusCode, gin.H{"message": message})
		return
	}

	// 升级 HTTP 连接为 WebSocket
	wsConn, err := h.upgradeWebSocket(c)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket: %v", err)
		return
	}
	defer wsConn.Close()

	// 创建本机 Docker 客户端
	cli, err := h.newDockerClient()
	if err != nil {
		log.Printf("Failed to create Docker client: %v", err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("连接 Docker 失败: "+err.Error()+"\r\n"))
		return
	}
	defer cli.Close()

	ctx := context.Background()

	// 创建 exec 配置
	execConfig := container.ExecOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Cmd:          []string{"/bin/bash"},
	}

	// 创建 exec 实例
	execResp, err := cli.ContainerExecCreate(ctx, dbContainer.ContainerID, execConfig)
	if err != nil {
		// 尝试使用 sh
		log.Printf("Failed to create exec with bash, trying sh: %v", err)
		execConfig.Cmd = []string{"/bin/sh"}
		execResp, err = cli.ContainerExecCreate(ctx, dbContainer.ContainerID, execConfig)
		if err != nil {
			log.Printf("Failed to create exec: %v", err)
			wsConn.WriteMessage(websocket.TextMessage, []byte("创建终端失败: "+err.Error()+"\r\n"))
			return
		}
	}

	log.Printf("Created exec instance: %s", execResp.ID)

	// 附加到 exec
	hijackedResp, err := cli.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{
		Tty: true,
	})
	if err != nil {
		log.Printf("Failed to attach exec: %v", err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("连接终端失败: "+err.Error()+"\r\n"))
		return
	}
	defer hijackedResp.Close()

	log.Printf("Attached to exec, starting bidirectional stream")

	// WebSocket -> Docker (用户输入)
	go func() {
		defer hijackedResp.Conn.Close()
		for {
			_, msg, err := wsConn.ReadMessage()
			if err != nil {
				log.Printf("WebSocket read error: %v", err)
				return
			}
			if _, err := hijackedResp.Conn.Write(msg); err != nil {
				log.Printf("Docker write error: %v", err)
				return
			}
		}
	}()

	// Docker -> WebSocket（较大缓冲减少系统调用，利于高并发终端输出）
	buffer := make([]byte, 32768)
	for {
		n, err := hijackedResp.Reader.Read(buffer)
		if err != nil {
			if err != io.EOF {
				log.Printf("Docker read error: %v", err)
				wsConn.WriteMessage(websocket.TextMessage, []byte("\r\n连接断开\r\n"))
			}
			return
		}
		if n > 0 {
			if err := wsConn.WriteMessage(websocket.TextMessage, buffer[:n]); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		}
	}
}

func (h *Handler) validateAdminTerminalContainer(serverID, dockerContainerID string) (*model.Container, int, string) {
	serverID = strings.TrimSpace(serverID)
	dockerContainerID = strings.TrimSpace(dockerContainerID)
	if serverID == "" || dockerContainerID == "" {
		return nil, http.StatusBadRequest, "Invalid terminal request"
	}

	var dbContainer model.Container
	err := h.db.Where("containerId = ?", dockerContainerID).First(&dbContainer).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, http.StatusNotFound, "Container not found"
		}
		return nil, http.StatusInternalServerError, "Load container failed"
	}

	if dbContainer.ServerID == nil || strings.TrimSpace(*dbContainer.ServerID) == "" {
		return nil, http.StatusForbidden, "Container server is not bound"
	}
	if strings.TrimSpace(*dbContainer.ServerID) != serverID {
		return nil, http.StatusForbidden, "Container does not belong to this server"
	}
	if dbContainer.Status != "running" {
		return nil, http.StatusConflict, "Container is not running"
	}

	return &dbContainer, http.StatusOK, ""
}

// UserContainerTerminal handles WebSocket terminal connections for student users
func (h *Handler) UserContainerTerminal(c *gin.Context) {
	// 升级 HTTP 连接为 WebSocket
	wsConn, err := h.upgradeWebSocket(c)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket: %v", err)
		return
	}
	defer wsConn.Close()

	// 获取容器ID
	containerID := c.Param("id")

	// 获取当前用户
	userID, ok := userIDFromCtx(c)
	if !ok {
		log.Printf("User not authenticated")
		wsConn.WriteMessage(websocket.TextMessage, []byte("未授权\r\n"))
		return
	}

	log.Printf("User terminal connection request: user=%s, container=%s", userID, containerID)

	// 查询容器信息，验证用户权限
	var dbContainer model.Container

	if err := h.db.Where("id = ?", containerID).First(&dbContainer).Error; err != nil {
		log.Printf("Container not found: %v", err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("容器不存在\r\n"))
		return
	}

	// 验证用户权限
	if dbContainer.UserID != userID {
		log.Printf("User %s does not own container %s (owner: %s)", userID, containerID, dbContainer.UserID)
		wsConn.WriteMessage(websocket.TextMessage, []byte("无权访问此容器\r\n"))
		return
	}

	// 验证容器状态
	if dbContainer.Status != "running" {
		log.Printf("Container %s is not running: %s", containerID, dbContainer.Status)
		wsConn.WriteMessage(websocket.TextMessage, []byte("容器未运行\r\n"))
		return
	}

	// 创建本机 Docker 客户端
	cli, err := h.newDockerClient()
	if err != nil {
		log.Printf("Failed to create Docker client: %v", err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("连接 Docker 失败: "+err.Error()+"\r\n"))
		return
	}
	defer cli.Close()

	ctx := context.Background()

	// 创建 exec 配置
	execConfig := container.ExecOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Cmd:          []string{"/bin/bash"},
	}

	// 创建 exec 实例
	execResp, err := cli.ContainerExecCreate(ctx, dbContainer.ContainerID, execConfig)
	if err != nil {
		// 尝试使用 sh
		log.Printf("Failed to create exec with bash, trying sh: %v", err)
		execConfig.Cmd = []string{"/bin/sh"}
		execResp, err = cli.ContainerExecCreate(ctx, dbContainer.ContainerID, execConfig)
		if err != nil {
			log.Printf("Failed to create exec: %v", err)
			wsConn.WriteMessage(websocket.TextMessage, []byte("创建终端失败: "+err.Error()+"\r\n"))
			return
		}
	}

	log.Printf("Created exec instance: %s", execResp.ID)

	// 附加到 exec
	hijackedResp, err := cli.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{
		Tty: true,
	})
	if err != nil {
		log.Printf("Failed to attach exec: %v", err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("连接终端失败: "+err.Error()+"\r\n"))
		return
	}
	defer hijackedResp.Close()

	log.Printf("Attached to exec, starting bidirectional stream")

	// WebSocket -> Docker (用户输入)
	go func() {
		defer hijackedResp.Conn.Close()
		for {
			_, msg, err := wsConn.ReadMessage()
			if err != nil {
				log.Printf("WebSocket read error: %v", err)
				return
			}
			if _, err := hijackedResp.Conn.Write(msg); err != nil {
				log.Printf("Docker write error: %v", err)
				return
			}
		}
	}()

	// Docker -> WebSocket（较大缓冲减少系统调用，利于高并发终端输出）
	buffer := make([]byte, 32768)
	for {
		n, err := hijackedResp.Reader.Read(buffer)
		if err != nil {
			if err != io.EOF {
				log.Printf("Docker read error: %v", err)
				wsConn.WriteMessage(websocket.TextMessage, []byte("\r\n连接断开\r\n"))
			}
			return
		}
		if n > 0 {
			if err := wsConn.WriteMessage(websocket.TextMessage, buffer[:n]); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		}
	}
}
