package main

import (
	"crypto/rand"
	"encoding/hex"
	"log"

	"sparklab/server/internal/config"
	"sparklab/server/internal/db"
	"sparklab/server/internal/model"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	database, err := db.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("open db failed: %v", err)
	}

	log.Println("Seeding database...")

	// Create admin user
	adminPassword, err := bcrypt.GenerateFromPassword([]byte("admin123"), 10)
	if err != nil {
		log.Fatalf("hash admin password failed: %v", err)
	}

	qqAdmin := "10000"
	admin := model.User{
		ID:           newID(),
		Username:     "admin",
		DisplayName:  "管理员",
		Email:        "admin@sparklab.com",
		Password:     string(adminPassword),
		Role:         "ADMIN",
		QQNumber:     &qqAdmin,
		CreatedAt:    model.Now(),
		UpdatedAt:    model.Now(),
		LastActiveAt: model.Now(),
	}

	err = database.Where("username = ?", "admin").FirstOrCreate(&admin).Error
	if err != nil {
		log.Fatalf("create admin failed: %v", err)
	}
	log.Println("Admin user created:", admin.Username)

	// Create student user
	studentPassword, err := bcrypt.GenerateFromPassword([]byte("student123"), 10)
	if err != nil {
		log.Fatalf("hash student password failed: %v", err)
	}

	qqStudent := "10001"
	student := model.User{
		ID:           newID(),
		Username:     "student",
		DisplayName:  "测试学生",
		Email:        "student@sparklab.com",
		Password:     string(studentPassword),
		Role:         "STUDENT",
		QQNumber:     &qqStudent,
		CreatedAt:    model.Now(),
		UpdatedAt:    model.Now(),
		LastActiveAt: model.Now(),
	}

	err = database.Where("username = ?", "student").FirstOrCreate(&student).Error
	if err != nil {
		log.Fatalf("create student failed: %v", err)
	}
	log.Println("Student user created:", student.Username)

	// Create courses
	course1ID := "course-1"
	course1 := model.Course{
		ID:          course1ID,
		Title:       "Linux 基础入门",
		Description: "从零开始学习 Linux 操作系统，掌握命令行基础操作",
		Difficulty:  "beginner",
		Duration:    120,
		IsActive:    true,
		CreatedAt:   model.Now(),
		UpdatedAt:   model.Now(),
	}
	err = database.Where("id = ?", course1ID).FirstOrCreate(&course1).Error
	if err != nil {
		log.Fatalf("create course1 failed: %v", err)
	}
	log.Println("Course created:", course1.Title)

	course2ID := "course-2"
	course2 := model.Course{
		ID:          course2ID,
		Title:       "Docker 容器技术",
		Description: "深入学习 Docker 容器化技术，掌握镜像构建和容器编排",
		Difficulty:  "intermediate",
		Duration:    180,
		IsActive:    true,
		CreatedAt:   model.Now(),
		UpdatedAt:   model.Now(),
	}
	err = database.Where("id = ?", course2ID).FirstOrCreate(&course2).Error
	if err != nil {
		log.Fatalf("create course2 failed: %v", err)
	}
	log.Println("Course created:", course2.Title)

	// Create labs
	lab1ID := "lab-1"
	lab1Content := `# Linux 文件系统操作

## 实验目标
- 掌握 ls、cd、pwd 等基本命令
- 学会创建、删除文件和目录
- 理解 Linux 文件权限

## 实验步骤

### 1. 查看当前目录
` + "```" + `bash
pwd
` + "```" + `

### 2. 列出文件
` + "```" + `bash
ls -la
` + "```" + `

### 3. 创建目录
` + "```" + `bash
mkdir test
cd test
` + "```" + `

### 4. 创建文件
` + "```" + `bash
touch hello.txt
echo "Hello Spark Lab" > hello.txt
cat hello.txt
` + "```" + `

## 判题标准
- 成功创建 test 目录
- 成功创建 hello.txt 文件
- 文件内容包含 "Hello Spark Lab"
`
	judgeScriptLab1 := "/judge/check_lab1.sh"
	lab1 := model.Lab{
		ID:              lab1ID,
		CourseID:        course1ID,
		Title:           "Linux 文件系统操作",
		Description:     "学习 Linux 文件系统的基本操作命令",
		Content:         lab1Content,
		Difficulty:      "beginner",
		Order:           1,
		Points:          100,
		TimeLimit:       30,
		ServerID:        nil,
		DockerImage:     "ubuntu:22.04",
		CPULimit:        1.0,
		MemoryLimit:     512,
		ShellCmd:        "",
		PortMappings:    nil,
		EnvironmentVars: nil,
		VolumeMounts:    nil,
		RestartPolicy:   "",
		JudgeType:       "auto",
		JudgeScript:     &judgeScriptLab1,
		CreatedAt:       model.Now(),
		UpdatedAt:       model.Now(),
	}
	err = database.Where("id = ?", lab1ID).FirstOrCreate(&lab1).Error
	if err != nil {
		log.Fatalf("create lab1 failed: %v", err)
	}
	log.Println("Lab created:", lab1.Title)

	// Create lab steps for lab1
	step1 := model.Step{
		ID:      newID(),
		LabID:   lab1ID,
		Title:   "查看当前目录",
		Content: "使用 `pwd` 命令查看当前所在目录",
		Order:   1,
		Hint:    ptr("提示：pwd 是 print working directory 的缩写"),
	}
	step2 := model.Step{
		ID:      newID(),
		LabID:   lab1ID,
		Title:   "创建测试目录",
		Content: "使用 `mkdir test` 创建一个名为 test 的目录",
		Order:   2,
		Hint:    ptr("提示：mkdir 是 make directory 的缩写"),
	}
	step3 := model.Step{
		ID:      newID(),
		LabID:   lab1ID,
		Title:   "创建文件并写入内容",
		Content: "在 test 目录中创建 hello.txt 文件，并写入 \"Hello Spark Lab\"",
		Order:   3,
		Hint:    ptr("提示：可以使用 echo 命令配合重定向符号 >"),
	}
	err = createStepsIfNotExist(database, []model.Step{step1, step2, step3})
	if err != nil {
		log.Fatalf("create steps for lab1 failed: %v", err)
	}
	log.Println("Lab steps created")

	lab2ID := "lab-2"
	lab2Content := `# Shell 脚本编程

## 实验目标
- 理解 Shell 脚本基本语法
- 学会使用变量和条件判断
- 编写实用的自动化脚本

## 实验内容
编写一个脚本，自动检测系统信息并输出。
`
	lab2 := model.Lab{
		ID:              lab2ID,
		CourseID:        course1ID,
		Title:           "Shell 脚本编程",
		Description:     "学习编写简单的 Shell 脚本",
		Content:         lab2Content,
		Difficulty:      "intermediate",
		Order:           2,
		Points:          150,
		TimeLimit:       45,
		ServerID:        nil,
		DockerImage:     "ubuntu:22.04",
		CPULimit:        1.0,
		MemoryLimit:     512,
		ShellCmd:        "",
		PortMappings:    nil,
		EnvironmentVars: nil,
		VolumeMounts:    nil,
		RestartPolicy:   "",
		JudgeType:       "manual",
		JudgeScript:     nil,
		CreatedAt:       model.Now(),
		UpdatedAt:       model.Now(),
	}
	err = database.Where("id = ?", lab2ID).FirstOrCreate(&lab2).Error
	if err != nil {
		log.Fatalf("create lab2 failed: %v", err)
	}
	log.Println("Lab created:", lab2.Title)

	log.Println("Seeding completed!")
}

func ptr[T any](v T) *T {
	return &v
}

func createStepsIfNotExist(db *gorm.DB, steps []model.Step) error {
	for _, step := range steps {
		var existing model.Step
		err := db.Where("labId = ? AND \"order\" = ?", step.LabID, step.Order).First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			if err := db.Create(&step).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
