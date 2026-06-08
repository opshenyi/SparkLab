package main

import (
	"fmt"
	"log"
	"os"

	"sparklab/server/internal/db"
)

func main() {
	// 获取数据库路径
	dbPath := os.Getenv("DATABASE_URL")
	if dbPath == "" {
		dbPath = "file:./prisma/spark_lab.db"
	}
	// 移除 file: 前缀
	if len(dbPath) > 5 && dbPath[:5] == "file:" {
		dbPath = dbPath[5:]
	}

	// 初始化数据库
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// 删除所有 sim- 前缀的容器
	result := database.Exec("DELETE FROM containers WHERE containerId LIKE 'sim-%'")
	if result.Error != nil {
		log.Fatal("Failed to delete containers:", result.Error)
	}

	fmt.Printf("Deleted %d simulated containers\n", result.RowsAffected)

	// 显示剩余容器
	var containers []struct {
		ID          string
		ContainerID string
		Status      string
	}
	database.Table("containers").Select("id, containerId, status").Find(&containers)

	fmt.Printf("\nRemaining containers: %d\n", len(containers))
	for _, c := range containers {
		fmt.Printf("- ID: %s, ContainerID: %s, Status: %s\n", c.ID[:12], c.ContainerID[:12], c.Status)
	}
}
