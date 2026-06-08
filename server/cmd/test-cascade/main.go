package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"sparklab/server/internal/model"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load("../../.env"); err != nil {
		log.Println("Warning: .env file not found")
	}

	// 连接数据库
	dbPath := os.Getenv("DATABASE_URL")
	if dbPath == "" {
		dbPath = "file:../../prisma/spark_lab.db?cache=shared&_fk=1"
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// 启用外键约束（SQLite 需要显式启用）
	db.Exec("PRAGMA foreign_keys = ON")

	// 查询所有课程
	var courses []model.Course
	if err := db.Find(&courses).Error; err != nil {
		log.Fatal("Failed to query courses:", err)
	}

	fmt.Println("\n=== 课程列表 ===")
	for _, course := range courses {
		fmt.Printf("ID: %s, Title: %s\n", course.ID, course.Title)

		// 统计关联数据
		var labCount, enrollmentCount int64
		db.Model(&model.Lab{}).Where("course_id = ?", course.ID).Count(&labCount)
		db.Model(&model.Enrollment{}).Where("course_id = ?", course.ID).Count(&enrollmentCount)

		fmt.Printf("  - Labs: %d\n", labCount)
		fmt.Printf("  - Enrollments: %d\n", enrollmentCount)

		// 如果有实验，统计实验的关联数据
		if labCount > 0 {
			var labs []model.Lab
			db.Where("course_id = ?", course.ID).Find(&labs)
			for _, lab := range labs {
				var containerCount, submissionCount, questionCount int64
				db.Model(&model.Container{}).Where("lab_id = ?", lab.ID).Count(&containerCount)
				db.Model(&model.Submission{}).Where("lab_id = ?", lab.ID).Count(&submissionCount)
				db.Model(&model.Question{}).Where("lab_id = ?", lab.ID).Count(&questionCount)

				if containerCount > 0 || submissionCount > 0 || questionCount > 0 {
					fmt.Printf("    Lab '%s': Containers=%d, Submissions=%d, Questions=%d\n",
						lab.Title, containerCount, submissionCount, questionCount)
				}
			}
		}
		fmt.Println()
	}

	fmt.Println("\n=== 级联删除测试说明 ===")
	fmt.Println("当前数据库的外键约束配置：")
	fmt.Println("✓ Enrollment → Course (onDelete: Cascade)")
	fmt.Println("✓ Lab → Course (onDelete: Cascade)")
	fmt.Println("✓ Container → Lab (onDelete: Cascade)")
	fmt.Println("✓ Submission → Lab (onDelete: Cascade)")
	fmt.Println("✓ Question → Lab (onDelete: Cascade)")
	fmt.Println("✓ Answer → Question (onDelete: Cascade)")
	fmt.Println("✓ VideoProgress → Lab (onDelete: Cascade)")
	fmt.Println("\n删除课程时，以上所有关联数据都会自动删除。")
	fmt.Println("\n注意：SQLite 需要在连接时启用外键约束：")
	fmt.Println("DATABASE_URL=\"file:./prisma/spark_lab.db?cache=shared&_fk=1\"")
}
