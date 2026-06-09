package model

import "time"

type User struct {
	ID                 string   `gorm:"column:id;primaryKey" json:"id"`
	Username           string   `gorm:"column:username" json:"username"`
	DisplayName        string   `gorm:"column:displayName" json:"displayName"`
	Email              string   `gorm:"column:email" json:"email"`
	Password           string   `gorm:"column:password" json:"-"`
	Role               string   `gorm:"column:role" json:"role"`
	Avatar             *string  `gorm:"column:avatar" json:"avatar,omitempty"`
	QQNumber           *string  `gorm:"column:qqNumber" json:"qqNumber,omitempty"`
	ClassID            *string  `gorm:"column:classId" json:"classId,omitempty"`
	MustChangePassword bool     `gorm:"column:mustChangePassword;default:false" json:"mustChangePassword"`
	CreatedAt          UnixTime `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt          UnixTime `gorm:"column:updatedAt" json:"-"`
	LastActiveAt       UnixTime `gorm:"column:lastActiveAt" json:"lastActiveAt"`
}

func (User) TableName() string { return "users" }

type Course struct {
	ID          string   `gorm:"column:id;primaryKey" json:"id"`
	Title       string   `gorm:"column:title" json:"title"`
	Description string   `gorm:"column:description" json:"description"`
	Cover       *string  `gorm:"column:cover" json:"cover,omitempty"`
	Type        string   `gorm:"column:type" json:"type"` // lab, video, exam
	Difficulty  string   `gorm:"column:difficulty" json:"difficulty"`
	Duration    int      `gorm:"column:duration" json:"duration"`
	IsActive    bool     `gorm:"column:isActive" json:"isActive"` // 是否开课
	ClassID     *string  `gorm:"column:classId" json:"classId,omitempty"`
	CreatedAt   UnixTime `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt   UnixTime `gorm:"column:updatedAt" json:"updatedAt"`
}

func (Course) TableName() string { return "courses" }

// CourseClassLink 课程可分配到多个学习小组（多对多）
type CourseClassLink struct {
	ID        string   `gorm:"column:id;primaryKey" json:"id"`
	CourseID  string   `gorm:"column:courseId;uniqueIndex:idx_ccl_course_class" json:"courseId"`
	ClassID   string   `gorm:"column:classId;uniqueIndex:idx_ccl_course_class" json:"classId"`
	CreatedAt UnixTime `gorm:"column:createdAt" json:"createdAt"`
}

func (CourseClassLink) TableName() string { return "course_class_links" }

// Class 学习小组（表名仍为 classes）；小组老师 homeroomTeacherId；创建者老师 creatorTeacherId
type Class struct {
	ID                string   `gorm:"column:id;primaryKey" json:"id"`
	Name              string   `gorm:"column:name" json:"name"`
	HomeroomTeacherID *string  `gorm:"column:homeroomTeacherId" json:"homeroomTeacherId,omitempty"`
	CreatorTeacherID  *string  `gorm:"column:creatorTeacherId" json:"creatorTeacherId,omitempty"`
	CreatedAt         UnixTime `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt         UnixTime `gorm:"column:updatedAt" json:"updatedAt"`
}

func (Class) TableName() string { return "classes" }

// GroupMembership 学生可加入多个学习小组
type GroupMembership struct {
	ID        string   `gorm:"column:id;primaryKey" json:"id"`
	UserID    string   `gorm:"column:userId;uniqueIndex:idx_gm_user_class" json:"userId"`
	ClassID   string   `gorm:"column:classId;uniqueIndex:idx_gm_user_class" json:"classId"`
	CreatedAt UnixTime `gorm:"column:createdAt" json:"createdAt"`
}

func (GroupMembership) TableName() string { return "group_memberships" }

// CourseMaterial 课件（Word/PDF/PPT 等），文件存磁盘，元数据在此表
type CourseMaterial struct {
	ID           string   `gorm:"column:id;primaryKey" json:"id"`
	CourseID     string   `gorm:"column:courseId" json:"courseId"`
	Title        string   `gorm:"column:title" json:"title"`
	OriginalName string   `gorm:"column:originalName" json:"originalName"`
	StoredPath   string   `gorm:"column:storedPath" json:"-"`
	MimeType     string   `gorm:"column:mimeType" json:"mimeType"`
	FileKind     string   `gorm:"column:fileKind" json:"fileKind"`
	SortOrder    int      `gorm:"column:sortOrder" json:"sortOrder"`
	CreatedAt    UnixTime `gorm:"column:createdAt" json:"createdAt"`
}

func (CourseMaterial) TableName() string { return "course_materials" }

type MaterialProgress struct {
	ID          string    `gorm:"column:id;primaryKey" json:"id"`
	UserID      string    `gorm:"column:userId" json:"userId"`
	MaterialID  string    `gorm:"column:materialId" json:"materialId"`
	Completed   bool      `gorm:"column:completed" json:"completed"`
	CompletedAt time.Time `gorm:"column:completedAt" json:"completedAt"`
	CreatedAt   time.Time `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"column:updatedAt" json:"updatedAt"`
}

func (MaterialProgress) TableName() string { return "material_progress" }

type Lab struct {
	ID              string   `gorm:"column:id;primaryKey" json:"id"`
	CourseID        string   `gorm:"column:courseId" json:"courseId"`
	Type            string   `gorm:"column:type" json:"type"` // lab, video, exam
	Title           string   `gorm:"column:title" json:"title"`
	Description     string   `gorm:"column:description" json:"description"`
	Content         string   `gorm:"column:content" json:"content"`
	Difficulty      string   `gorm:"column:difficulty" json:"difficulty"`
	Order           int      `gorm:"column:order" json:"order"`
	Points          int      `gorm:"column:points" json:"points"`
	TimeLimit       int      `gorm:"column:timeLimit" json:"timeLimit"`
	VideoURL        *string  `gorm:"column:videoUrl" json:"videoUrl,omitempty"`
	VideoDuration   int      `gorm:"column:videoDuration" json:"videoDuration"`
	ServerID        *string  `gorm:"column:serverId" json:"serverId,omitempty"`
	DockerImage     string   `gorm:"column:dockerImage" json:"dockerImage"`
	CPULimit        float64  `gorm:"column:cpuLimit" json:"cpuLimit"`
	MemoryLimit     int      `gorm:"column:memoryLimit" json:"memoryLimit"`
	ShellCmd        string   `gorm:"column:shellCommand" json:"shellCommand"`
	PortMappings    *string  `gorm:"column:portMappings" json:"portMappings,omitempty"`
	EnvironmentVars *string  `gorm:"column:environmentVars" json:"environmentVars,omitempty"`
	VolumeMounts    *string  `gorm:"column:volumeMounts" json:"volumeMounts,omitempty"`
	RestartPolicy   string   `gorm:"column:restartPolicy" json:"restartPolicy"`
	JudgeType       string   `gorm:"column:judgeType" json:"judgeType"`
	JudgeScript     *string  `gorm:"column:judgeScript" json:"judgeScript,omitempty"`
	CreatedAt       UnixTime `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt       UnixTime `gorm:"column:updatedAt" json:"updatedAt"`
}

func (Lab) TableName() string { return "labs" }

type Step struct {
	ID string `gorm:"column:id;primaryKey" json:"id"`
	// ... rest unchanged
	LabID   string  `gorm:"column:labId" json:"labId"`
	Title   string  `gorm:"column:title" json:"title"`
	Content string  `gorm:"column:content" json:"content"`
	Order   int     `gorm:"column:order" json:"order"`
	Hint    *string `gorm:"column:hint" json:"hint,omitempty"`
}

func (Step) TableName() string { return "steps" }

type Enrollment struct {
	ID          string    `gorm:"column:id;primaryKey" json:"id"`
	UserID      string    `gorm:"column:userId" json:"userId"`
	CourseID    string    `gorm:"column:courseId" json:"courseId"`
	Progress    int       `gorm:"column:progress" json:"progress"`
	StartedAt   UnixTime  `gorm:"column:startedAt" json:"startedAt"`
	CompletedAt *UnixTime `gorm:"column:completedAt" json:"completedAt,omitempty"`
}

func (Enrollment) TableName() string { return "enrollments" }

type Submission struct {
	ID          string   `gorm:"column:id;primaryKey" json:"id"`
	UserID      string   `gorm:"column:userId" json:"userId"`
	LabID       string   `gorm:"column:labId" json:"labId"`
	Score       int      `gorm:"column:score" json:"score"`
	MaxScore    int      `gorm:"column:maxScore" json:"maxScore"`
	Status      string   `gorm:"column:status" json:"status"`
	Output      *string  `gorm:"column:output" json:"output,omitempty"`
	Logs        *string  `gorm:"column:logs" json:"logs,omitempty"`
	Feedback    *string  `gorm:"column:feedback" json:"feedback,omitempty"`
	SubmittedAt UnixTime `gorm:"column:submittedAt" json:"submittedAt"`
}

func (Submission) TableName() string { return "submissions" }

type Container struct {
	ID           string     `gorm:"column:id;primaryKey" json:"id"`
	UserID       string     `gorm:"column:userId" json:"userId"`
	LabID        string     `gorm:"column:labId" json:"labId"`
	ServerID     *string    `gorm:"column:serverId" json:"serverId,omitempty"`
	ContainerID  string     `gorm:"column:containerId" json:"containerId"`
	Status       string     `gorm:"column:status" json:"status"`
	PortMappings *string    `gorm:"column:portMappings" json:"portMappings,omitempty"`
	CPULimit     float64    `gorm:"column:cpuLimit" json:"cpuLimit"`
	MemoryLimit  int        `gorm:"column:memoryLimit" json:"memoryLimit"`
	CreatedAt    time.Time  `gorm:"column:createdAt" json:"createdAt"`
	StartedAt    *time.Time `gorm:"column:startedAt" json:"startedAt,omitempty"`
	StoppedAt    *time.Time `gorm:"column:stoppedAt" json:"stoppedAt,omitempty"`
	LastActiveAt time.Time  `gorm:"column:lastActiveAt" json:"lastActiveAt"`
	AutoStopAt   *time.Time `gorm:"column:autoStopAt" json:"autoStopAt,omitempty"`
}

func (Container) TableName() string { return "containers" }

type Server struct {
	ID               string    `gorm:"column:id;primaryKey" json:"id"`
	Name             string    `gorm:"column:name" json:"name"`
	Host             string    `gorm:"column:host" json:"host"`
	Port             int       `gorm:"column:port" json:"port"`
	Username         string    `gorm:"column:username" json:"username"`
	AuthType         string    `gorm:"column:authType" json:"authType"`
	Password         *string   `gorm:"column:password" json:"-"`
	PrivateKey       *string   `gorm:"column:privateKey" json:"-"`
	Status           string    `gorm:"column:status" json:"status"`
	LastCheckAt      time.Time `gorm:"column:lastCheckAt" json:"lastCheckAt"`
	MaxContainers    int       `gorm:"column:maxContainers" json:"maxContainers"`
	CPUCores         int       `gorm:"column:cpuCores" json:"cpuCores"`
	CPUModel         *string   `gorm:"column:cpuModel" json:"cpuModel,omitempty"`
	TotalMemory      int       `gorm:"column:totalMemory" json:"totalMemory"`
	ActiveContainers int       `gorm:"column:activeContainers" json:"activeContainers"`
	CPUUsage         float64   `gorm:"column:cpuUsage" json:"cpuUsage"`
	MemoryUsage      float64   `gorm:"column:memoryUsage" json:"memoryUsage"`
	CPUIdlePrev      uint64    `gorm:"column:cpuIdlePrev" json:"-"`
	CPUTotalPrev     uint64    `gorm:"column:cpuTotalPrev" json:"-"`
	CreatedAt        time.Time `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt        time.Time `gorm:"column:updatedAt" json:"updatedAt"`
}

func (Server) TableName() string { return "servers" }

type Question struct {
	ID          string   `gorm:"column:id;primaryKey" json:"id"`
	LabID       string   `gorm:"column:labId" json:"labId"`
	Type        string   `gorm:"column:type" json:"type"` // single, multiple, judge, fill, essay
	Title       string   `gorm:"column:title" json:"title"`
	Content     string   `gorm:"column:content" json:"content"`
	Options     *string  `gorm:"column:options" json:"options,omitempty"`
	Answer      string   `gorm:"column:answer" json:"answer"`
	Explanation *string  `gorm:"column:explanation" json:"explanation,omitempty"`
	Points      int      `gorm:"column:points" json:"points"`
	Order       int      `gorm:"column:order" json:"order"`
	CreatedAt   UnixTime `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt   UnixTime `gorm:"column:updatedAt" json:"updatedAt"`
}

func (Question) TableName() string { return "questions" }

type Answer struct {
	ID           string   `gorm:"column:id;primaryKey" json:"id"`
	UserID       string   `gorm:"column:userId" json:"userId"`
	QuestionID   string   `gorm:"column:questionId" json:"questionId"`
	SubmissionID string   `gorm:"column:submissionId" json:"submissionId"`
	Answer       string   `gorm:"column:answer" json:"answer"`
	IsCorrect    bool     `gorm:"column:isCorrect" json:"isCorrect"`
	Score        int      `gorm:"column:score" json:"score"`
	CreatedAt    UnixTime `gorm:"column:createdAt" json:"createdAt"`
}

func (Answer) TableName() string { return "answers" }

type VideoProgress struct {
	ID              string    `gorm:"column:id;primaryKey" json:"id"`
	UserID          string    `gorm:"column:userId" json:"userId"`
	LabID           string    `gorm:"column:labId" json:"labId"`
	WatchedDuration int       `gorm:"column:watchedDuration" json:"watchedDuration"`
	TotalDuration   int       `gorm:"column:totalDuration" json:"totalDuration"`
	Completed       bool      `gorm:"column:completed" json:"completed"`
	LastWatchedAt   time.Time `gorm:"column:lastWatchedAt" json:"lastWatchedAt"`
	CreatedAt       time.Time `gorm:"column:createdAt" json:"createdAt"`
	UpdatedAt       time.Time `gorm:"column:updatedAt" json:"updatedAt"`
}

func (VideoProgress) TableName() string { return "video_progress" }

type ActivityLog struct {
	ID         string    `gorm:"column:id;primaryKey" json:"id"`
	UserID     string    `gorm:"column:userId" json:"userId"`
	Action     string    `gorm:"column:action" json:"action"`
	TargetType *string   `gorm:"column:targetType" json:"targetType,omitempty"`
	TargetID   *string   `gorm:"column:targetId" json:"targetId,omitempty"`
	TargetName *string   `gorm:"column:targetName" json:"targetName,omitempty"`
	Metadata   *string   `gorm:"column:metadata" json:"metadata,omitempty"`
	CreatedAt  time.Time `gorm:"column:createdAt" json:"createdAt"`
}

func (ActivityLog) TableName() string { return "activity_logs" }
