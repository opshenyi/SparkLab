package main

import (
	"fmt"
	"log"

	"sparklab/server/internal/config"
	"sparklab/server/internal/db"
	"sparklab/server/internal/model"
)

func main() {
	cfg := config.Load()
	database, err := db.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// 查找所有课程
	var courses []model.Course
	database.Find(&courses)
	
	fmt.Printf("\nTotal courses: %d\n", len(courses))
	fmt.Println("All courses:")
	courseMap := make(map[string]bool)
	for i, c := range courses {
		fmt.Printf("%d. ID: %s, Title: %s\n", i+1, c.ID, c.Title)
		courseMap[c.ID] = true
	}
	
	// 查找所有enrollment记录
	var enrollments []model.Enrollment
	database.Find(&enrollments)
	
	fmt.Printf("\nTotal enrollments: %d\n\n", len(enrollments))
	
	// 显示所有enrollment并检查课程是否存在
	fmt.Println("All enrollments:")
	orphanedEnrollments := []string{}
	for i, e := range enrollments {
		exists := "EXISTS"
		if !courseMap[e.CourseID] {
			exists = "ORPHANED (course not found)"
			orphanedEnrollments = append(orphanedEnrollments, e.ID)
		}
		fmt.Printf("%d. ID: %s, UserID: %s, CourseID: %s [%s]\n", 
			i+1, e.ID, e.UserID, e.CourseID, exists)
	}

	// 使用map来跟踪唯一的 userId+courseId 组合
	seen := make(map[string]string) // key: userId+courseId, value: enrollmentId
	duplicates := []string{}

	for _, e := range enrollments {
		key := e.UserID + "|" + e.CourseID
		if existingId, exists := seen[key]; exists {
			// 发现重复，保留较早的记录，删除较新的
			fmt.Printf("Found duplicate: User %s, Course %s\n", e.UserID, e.CourseID)
			fmt.Printf("  Keeping: %s (started: %v)\n", existingId, e.StartedAt)
			fmt.Printf("  Deleting: %s\n", e.ID)
			duplicates = append(duplicates, e.ID)
		} else {
			seen[key] = e.ID
		}
	}

	if len(duplicates) > 0 {
		fmt.Printf("\nFound %d duplicate enrollments\n", len(duplicates))
		fmt.Println("Deleting duplicates...")
		
		result := database.Where("id IN ?", duplicates).Delete(&model.Enrollment{})
		if result.Error != nil {
			log.Fatal("Failed to delete duplicates:", result.Error)
		}
		
		fmt.Printf("Successfully deleted %d duplicate enrollments\n", result.RowsAffected)
	} else {
		fmt.Println("\nNo duplicates found!")
	}
	
	// 删除孤立的enrollment（课程不存在）
	if len(orphanedEnrollments) > 0 {
		fmt.Printf("\nFound %d orphaned enrollments (courses don't exist)\n", len(orphanedEnrollments))
		fmt.Println("Deleting orphaned enrollments...")
		
		result := database.Where("id IN ?", orphanedEnrollments).Delete(&model.Enrollment{})
		if result.Error != nil {
			log.Fatal("Failed to delete orphaned enrollments:", result.Error)
		}
		
		fmt.Printf("Successfully deleted %d orphaned enrollments\n", result.RowsAffected)
	}

	// 验证结果
	var finalCount int64
	database.Model(&model.Enrollment{}).Count(&finalCount)
	fmt.Printf("\nFinal enrollment count: %d\n", finalCount)
}
