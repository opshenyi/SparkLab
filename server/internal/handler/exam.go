package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

// GetExamQuestions 获取试卷的所有题目
func (h *Handler) GetExamQuestions(c *gin.Context) {
	labID := c.Param("id")

	courseID, err := h.labCourseID(labID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Lab not found"})
		return
	}
	uid, hasUser := userIDFromCtx(c)
	role := userRoleFromCtx(c)
	co, err := h.courseByID(courseID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}
	if !h.userCanViewCourse(co, uid, role, hasUser) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权访问"})
		return
	}

	includeAnswers := role == "ADMIN" || role == "AUTHOR"
	if role == "TEACHER" && hasUser {
		includeAnswers = h.teacherManagesCourse(uid, courseID)
	}

	var questions []model.Question
	if err := h.db.Where("labId = ?", labID).Order("`order` asc").Find(&questions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to load questions"})
		return
	}

	resp := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		var options []string
		if q.Options != nil && *q.Options != "" {
			json.Unmarshal([]byte(*q.Options), &options)
		}

		questionData := gin.H{
			"id":      q.ID,
			"labId":   q.LabID,
			"type":    q.Type,
			"title":   q.Title,
			"content": q.Content,
			"options": options,
			"points":  q.Points,
			"order":   q.Order,
		}

		// 只有管理员才返回答案和解析
		if includeAnswers {
			var answer interface{}
			if q.Answer != "" {
				json.Unmarshal([]byte(q.Answer), &answer)
			}
			questionData["answer"] = answer
			questionData["explanation"] = q.Explanation
		}

		resp = append(resp, questionData)
	}

	c.JSON(http.StatusOK, resp)
}

// SaveExamQuestions 批量保存试卷题目（管理员）
func (h *Handler) SaveExamQuestions(c *gin.Context) {
	labID := c.Param("id")
	role := userRoleFromCtx(c)
	if role != "ADMIN" && role != "AUTHOR" {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}
	h.persistExamQuestions(c, labID)
}

func (h *Handler) persistExamQuestions(c *gin.Context, labID string) {
	var req struct {
		Questions []struct {
			ID          *string     `json:"id"`
			Type        string      `json:"type"`
			Title       string      `json:"title"`
			Content     string      `json:"content"`
			Options     []string    `json:"options"`
			Answer      interface{} `json:"answer"`
			Explanation *string     `json:"explanation"`
			Points      int         `json:"points"`
			Order       int         `json:"order"`
		} `json:"questions"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request"})
		return
	}

	var lab model.Lab
	if err := h.db.Where("id = ? AND type = ?", labID, "exam").First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Exam not found"})
		return
	}

	tx := h.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Where("labId = ?", labID).Delete(&model.Question{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to delete old questions"})
		return
	}

	for _, q := range req.Questions {
		question := model.Question{
			ID:      newID(),
			LabID:   labID,
			Type:    q.Type,
			Title:   q.Title,
			Content: q.Content,
			Points:  q.Points,
			Order:   q.Order,
		}

		if len(q.Options) > 0 {
			optionsJSON, _ := json.Marshal(q.Options)
			optionsStr := string(optionsJSON)
			question.Options = &optionsStr
		}

		if q.Answer != nil {
			answerJSON, _ := json.Marshal(q.Answer)
			question.Answer = string(answerJSON)
		}

		if q.Explanation != nil {
			question.Explanation = q.Explanation
		}

		if err := tx.Create(&question).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create question"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save questions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Questions saved successfully"})
}

// SubmitExam 提交试卷答案
func (h *Handler) SubmitExam(c *gin.Context) {
	labID := c.Param("id")
	uid, _ := userIDFromCtx(c)

	courseID, err := h.labCourseID(labID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Exam not found"})
		return
	}
	co, err := h.courseByID(courseID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Course not found"})
		return
	}
	role := userRoleFromCtx(c)
	if !h.userCanViewCourse(co, uid, role, true) {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权参与该试卷"})
		return
	}

	var req struct {
		Answers []struct {
			QuestionID string      `json:"questionId"`
			Answer     interface{} `json:"answer"`
		} `json:"answers"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request"})
		return
	}

	// 验证实验是否存在且类型为exam
	var lab model.Lab
	if err := h.db.Where("id = ? AND type = ?", labID, "exam").First(&lab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Exam not found"})
		return
	}

	var questions []model.Question
	if err := h.db.Where("labId = ?", labID).Find(&questions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to load questions"})
		return
	}
	questionsByID := make(map[string]model.Question, len(questions))
	for _, question := range questions {
		questionsByID[question.ID] = question
	}
	seenQuestionIDs := make(map[string]struct{}, len(req.Answers))
	for _, ans := range req.Answers {
		questionID := strings.TrimSpace(ans.QuestionID)
		if questionID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid questionId"})
			return
		}
		if _, duplicated := seenQuestionIDs[questionID]; duplicated {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Duplicate questionId"})
			return
		}
		if _, ok := questionsByID[questionID]; !ok {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Question does not belong to this exam"})
			return
		}
		seenQuestionIDs[questionID] = struct{}{}
	}

	// 创建提交记录
	submission := model.Submission{
		ID:          newID(),
		UserID:      uid,
		LabID:       labID,
		Status:      "pending",
		MaxScore:    lab.Points,
		Score:       0,
		SubmittedAt: model.Now(),
	}

	// 开始事务
	tx := h.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Create(&submission).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create submission"})
		return
	}

	totalScore := 0
	requiresManualGrading := false

	// 处理每个答案
	for _, ans := range req.Answers {
		question := questionsByID[strings.TrimSpace(ans.QuestionID)]

		// 将学生答案转为JSON
		studentAnswerJSON, _ := json.Marshal(ans.Answer)
		studentAnswerStr := string(studentAnswerJSON)

		// 判断答案是否正确
		isCorrect := false
		score := 0

		// 解析正确答案
		var correctAnswer interface{}
		json.Unmarshal([]byte(question.Answer), &correctAnswer)

		// 根据题目类型判断
		switch question.Type {
		case "single", "judge", "fill":
			// 单选、判断、填空题：直接比较
			if studentAnswerStr == question.Answer {
				isCorrect = true
				score = question.Points
			}
		case "multiple":
			// 多选题：比较数组（需要排序后比较）
			var studentAns []string
			var correctAns []string
			json.Unmarshal([]byte(studentAnswerStr), &studentAns)
			json.Unmarshal([]byte(question.Answer), &correctAns)

			if sameStringSet(studentAns, correctAns) {
				isCorrect = true
				score = question.Points
			}
		case "essay":
			// 简答题：不自动判分，需要人工批改
			requiresManualGrading = true
			isCorrect = false
			score = 0
		}

		totalScore += score

		// 创建答案记录
		answer := model.Answer{
			ID:           newID(),
			UserID:       uid,
			QuestionID:   ans.QuestionID,
			SubmissionID: submission.ID,
			Answer:       studentAnswerStr,
			IsCorrect:    isCorrect,
			Score:        score,
			CreatedAt:    model.Now(),
		}

		if err := tx.Create(&answer).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save answer"})
			return
		}
	}
	if totalScore > lab.Points {
		totalScore = lab.Points
	}

	// 更新提交记录的分数
	submission.Score = totalScore
	if requiresManualGrading {
		submission.Status = "pending"
	} else if totalScore >= int(float64(lab.Points)*0.6) {
		submission.Status = "passed"
	} else {
		submission.Status = "failed"
	}

	if err := tx.Save(&submission).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update submission"})
		return
	}

	// 提交事务
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to submit exam"})
		return
	}
	_, _ = h.refreshCourseProgressForUser(uid, lab.CourseID)

	c.JSON(http.StatusOK, gin.H{
		"submissionId": submission.ID,
		"score":        totalScore,
		"maxScore":     lab.Points,
		"status":       submission.Status,
	})
}

func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	counts := make(map[string]int, len(a))
	for _, value := range a {
		counts[strings.TrimSpace(value)]++
	}
	for _, value := range b {
		key := strings.TrimSpace(value)
		counts[key]--
		if counts[key] < 0 {
			return false
		}
	}
	for _, count := range counts {
		if count != 0 {
			return false
		}
	}
	return true
}

// GetExamSubmission 获取试卷提交详情
func (h *Handler) GetExamSubmission(c *gin.Context) {
	submissionID := c.Param("submissionId")
	uid, _ := userIDFromCtx(c)
	role := userRoleFromCtx(c)

	submissionCtx, err := h.loadSubmissionContext(submissionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Submission not found"})
		return
	}
	submission := submissionCtx.Submission
	lab := submissionCtx.Lab
	course := submissionCtx.Course
	if !h.userCanViewSubmission(submissionCtx, uid, role) {
		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		return
	}

	var student model.User
	if err := h.db.Select("id", "username", "displayName", "role", "qqNumber", "avatar", "classId").Where("id = ?", submission.UserID).Take(&student).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Student not found"})
		return
	}

	// 获取答案详情
	var answers []model.Answer
	h.db.Where("submissionId = ?", submissionID).Find(&answers)

	answerDetails := make([]gin.H, 0, len(answers))
	for _, ans := range answers {
		var question model.Question
		h.db.Where("id = ?", ans.QuestionID).First(&question)

		var studentAnswer interface{}
		json.Unmarshal([]byte(ans.Answer), &studentAnswer)

		var correctAnswer interface{}
		json.Unmarshal([]byte(question.Answer), &correctAnswer)

		answerDetails = append(answerDetails, gin.H{
			"questionId":    ans.QuestionID,
			"questionTitle": question.Title,
			"question":      question.Content,
			"questionType":  question.Type,
			"studentAnswer": studentAnswer,
			"correctAnswer": correctAnswer,
			"isCorrect":     ans.IsCorrect,
			"score":         ans.Score,
			"maxScore":      question.Points,
			"explanation":   question.Explanation,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          submission.ID,
		"userId":      submission.UserID,
		"labId":       submission.LabID,
		"score":       submission.Score,
		"maxScore":    submission.MaxScore,
		"status":      submission.Status,
		"feedback":    submission.Feedback,
		"submittedAt": submission.SubmittedAt,
		"student": gin.H{
			"id":          student.ID,
			"username":    student.Username,
			"displayName": student.DisplayName,
			"role":        student.Role,
			"qqNumber":    student.QQNumber,
			"avatar":      student.Avatar,
			"classId":     student.ClassID,
		},
		"lab": gin.H{
			"id":    lab.ID,
			"title": lab.Title,
			"type":  lab.Type,
		},
		"course": gin.H{
			"id":    course.ID,
			"title": course.Title,
		},
		"answers": answerDetails,
	})
}
