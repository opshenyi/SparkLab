# SparkLab 星火实验室 - 完整项目交接文档

> **文档版本**: v1.0  
> **创建日期**: 2026年4月11日  
> **项目版本**: α 0.2.0.3184  
> **开源协议**: Apache License 2.0  
> **作者**: Shenyi

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [项目结构](#3-项目结构)
4. [核心功能模块](#4-核心功能模块)
5. [数据库设计](#5-数据库设计)
6. [API接口文档](#6-api接口文档)
7. [部署指南](#7-部署指南)
8. [开发指南](#8-开发指南)
9. [常见问题](#9-常见问题)
10. [未来规划](#10-未来规划)

---

## 1. 项目概述

### 1.1 项目简介

**SparkLab（星火实验室）** 是一个面向"星火工作坊"学员的在线技能实验平台。学员可以在安全隔离的Docker容器环境中完成实验任务、观看教学视频、参加在线考试。

### 1.2 核心特性

- ✅ **多类型课程支持**: 实验课程、视频课程、试卷考试
- ✅ **Docker容器管理**: 自动创建、启动、停止、回收容器
- ✅ **Web终端**: 浏览器内直接操作容器终端（WebSocket + xterm.js）
- ✅ **资源监控**: 实时监控服务器CPU、内存、容器状态
- ✅ **权限管理**: 学生、教师、作者、管理员四级权限
- ✅ **活动日志**: 记录用户所有操作行为
- ✅ **自动回收**: 容器心跳检测，超时自动停止
- ✅ **视频进度追踪**: 记录学员观看进度
- ✅ **在线考试**: 支持单选、多选、判断、填空、简答题

### 1.3 技术亮点

- **前后端分离**: Next.js (React) + Go (Gin)
- **实时通信**: WebSocket 终端连接
- **容器编排**: Docker SDK 直接管理容器
- **数据库**: SQLite (开发) / PostgreSQL (生产可切换)
- **认证**: JWT Token (Cookie + Header 双模式)
- **状态管理**: Zustand (轻量级)
- **UI框架**: Tailwind CSS + Material Design 3 风格

---

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         用户浏览器                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  React UI    │  │  WebSocket   │  │  HTTP API    │      │
│  │  (Next.js)   │  │  (Terminal)  │  │  (Axios)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          │ HTTP             │ WebSocket        │ HTTP
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────┐
│                    Next.js Server (Port 3000)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  API Proxy: /server/* → Go Backend                     │ │
│  │  Static Files: /uploads/videos/*                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────┬──────────────────┬──────────────────┬─────────────┘
          │                  │                  │
          │ HTTP             │ WebSocket        │ HTTP
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────┐
│                    Go Backend (Port 3001)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Gin Router  │  │  WebSocket   │  │  JWT Auth    │      │
│  │  (REST API)  │  │  (Terminal)  │  │  Middleware  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│  ┌──────▼──────────────────▼──────────────────▼───────┐    │
│  │              GORM (ORM Layer)                       │    │
│  └──────┬──────────────────────────────────────────────┘    │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────────┐
│                SQLite Database (spark_lab.db)             │
│  Users | Courses | Labs | Containers | Servers | ...     │
└───────────────────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────────┐
│                    Docker Engine                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │Container1│  │Container2│  │Container3│  ...           │
│  └──────────┘  └──────────┘  └──────────┘               │
└───────────────────────────────────────────────────────────┘
```

### 2.2 技术栈详细清单

#### 后端 (Go)
- **框架**: Gin v1.10.0 (HTTP Web框架)
- **ORM**: GORM v1.30.0 (数据库ORM)
- **数据库驱动**: glebarez/sqlite v1.11.0
- **JWT**: golang-jwt/jwt/v5 v5.2.1
- **Docker SDK**: docker/docker v28.5.2
- **WebSocket**: gorilla/websocket v1.5.1
- **系统监控**: shirou/gopsutil/v3 v3.23.12
- **CORS**: gin-contrib/cors v1.7.2
- **环境变量**: joho/godotenv v1.5.1
- **密码加密**: golang.org/x/crypto v0.48.0

#### 前端 (Next.js + React)
- **框架**: Next.js 14.1.0 (React 18.2.0)
- **语言**: TypeScript 5.3.3
- **状态管理**: Zustand 4.5.0
- **HTTP客户端**: Axios 1.6.5
- **UI样式**: Tailwind CSS 3.4.1
- **动画**: Framer Motion 11.0.0, GSAP 3.14.2
- **终端**: @xterm/xterm 5.3.0, @xterm/addon-fit 0.10.0
- **代码编辑器**: @monaco-editor/react 4.6.0
- **Markdown渲染**: react-markdown 9.1.0
- **图标**: Lucide React 0.309.0
- **工具库**: clsx, tailwind-merge, class-variance-authority

#### 数据库
- **开发环境**: SQLite 3
- **生产环境**: PostgreSQL (可切换)
- **迁移工具**: Prisma (schema定义)

---

## 3. 项目结构

### 3.1 目录结构

```
SparkLab/
├── server/                          # Go 后端
│   ├── cmd/                         # 命令行工具
│   │   ├── server/                  # 主服务器入口
│   │   │   └── main.go
│   │   ├── seed/                    # 数据库种子数据
│   │   │   └── main.go
│   │   ├── cleanup/                 # 容器清理工具
│   │   │   └── main.go
│   │   ├── cleanup-enrollments/     # 课程注册清理
│   │   │   └── main.go
│   │   └── test-cascade/            # 级联删除测试
│   │       └── main.go
│   ├── internal/                    # 内部包
│   │   ├── auth/                    # 认证模块
│   │   │   ├── jwt.go               # JWT生成和解析
│   │   │   └── middleware.go        # 认证中间件
│   │   ├── config/                  # 配置管理
│   │   │   └── config.go
│   │   ├── db/                      # 数据库连接
│   │   │   └── db.go
│   │   ├── handler/                 # HTTP处理器
│   │   │   ├── handler.go           # 基础Handler
│   │   │   ├── auth.go              # 认证相关
│   │   │   ├── course.go            # 课程管理
│   │   │   ├── lab.go               # 实验管理
│   │   │   ├── container.go         # 容器管理
│   │   │   ├── server.go            # 服务器管理
│   │   │   ├── admin.go             # 管理员功能
│   │   │   ├── monitor.go           # 监控功能
│   │   │   ├── terminal.go          # WebSocket终端
│   │   │   ├── volume.go            # 存储卷管理
│   │   │   ├── activity.go          # 活动日志
│   │   │   ├── context.go           # 上下文工具
│   │   │   └── helpers.go           # 辅助函数
│   │   ├── model/                   # 数据模型
│   │   │   ├── models.go            # 所有模型定义
│   │   │   └── time.go              # 时间工具
│   │   ├── monitor/                 # 系统监控
│   │   │   └── monitor.go
│   │   ├── router/                  # 路由配置
│   │   │   └── router.go
│   │   └── util/                    # 工具函数
│   │       └── http.go
│   ├── prisma/                      # Prisma ORM
│   │   ├── schema.prisma            # 数据库Schema
│   │   ├── seed.ts                  # 种子数据脚本
│   │   ├── spark_lab.db             # SQLite数据库文件
│   │   └── migrations/              # 数据库迁移
│   │       ├── 20260401112546_init/
│   │       ├── 20260402000000_add_cpu_tracking/
│   │       ├── 20260407000000_add_composes/
│   │       ├── 20260407100000_add_author_role/
│   │       ├── 20260407100857_remove_snapshots/
│   │       ├── 20260408000000_add_course_types/
│   │       ├── 20260409000000_add_soft_delete/
│   │       ├── 20260409100000_change_to_active_status/
│   │       └── 20260409120000_add_activity_logs/
│   ├── .env                         # 环境变量
│   ├── go.mod                       # Go依赖管理
│   ├── go.sum                       # Go依赖锁定
│   └── package.json                 # Prisma依赖
│
├── web/                             # Next.js 前端
│   ├── src/
│   │   ├── app/                     # Next.js App Router
│   │   │   ├── page.tsx             # 首页（登录页）
│   │   │   ├── layout.tsx           # 根布局
│   │   │   ├── globals.css          # 全局样式
│   │   │   ├── login/               # 登录页
│   │   │   ├── register/            # 注册页
│   │   │   ├── dashboard/           # 学生仪表盘
│   │   │   ├── explore/             # 课程浏览
│   │   │   ├── courses/[id]/        # 课程详情
│   │   │   ├── lab/[id]/            # 实验页面
│   │   │   ├── video/[id]/          # 视频页面
│   │   │   ├── exam/[id]/           # 考试页面
│   │   │   ├── containers/          # 容器列表
│   │   │   ├── profile/             # 个人资料
│   │   │   ├── admin/               # 管理员页面
│   │   │   │   ├── page.tsx         # 管理员仪表盘
│   │   │   │   ├── users/           # 用户管理
│   │   │   │   ├── courses/         # 课程管理
│   │   │   │   ├── servers/         # 服务器管理
│   │   │   │   ├── containers/      # 容器管理
│   │   │   │   ├── images/          # 镜像管理
│   │   │   │   ├── networks/        # 网络管理
│   │   │   │   └── volumes/         # 存储卷管理
│   │   │   ├── api/                 # API路由
│   │   │   │   ├── proxy/[...path]/ # 通用代理
│   │   │   │   ├── upload/video/    # 视频上传
│   │   │   │   └── server/[...path]/# 后端代理
│   │   │   └── server/[...path]/    # 后端API代理
│   │   ├── components/              # React组件
│   │   │   ├── Sidebar.tsx          # 学生侧边栏
│   │   │   ├── AdminSidebar.tsx     # 管理员侧边栏
│   │   │   ├── TopNavBar.tsx        # 顶部导航
│   │   │   ├── LoadingBar.tsx       # 加载进度条
│   │   │   ├── ContainerTerminal.tsx# 容器终端
│   │   │   ├── DockerContainerManager.tsx # Docker管理
│   │   │   ├── ResourceMonitor.tsx  # 资源监控
│   │   │   ├── ParticleBackground.tsx # 粒子背景
│   │   │   └── AnimatedTerminal.tsx # 动画终端
│   │   ├── store/                   # Zustand状态管理
│   │   │   └── useAuthStore.ts      # 认证状态
│   │   └── lib/                     # 工具库
│   │       ├── api.ts               # API封装
│   │       ├── avatar.ts            # 头像工具
│   │       └── utils.ts             # 通用工具
│   ├── public/                      # 静态资源
│   │   ├── video.mp4                # 首页背景视频
│   │   └── uploads/videos/          # 上传的视频
│   ├── .env                         # 环境变量
│   ├── next.config.js               # Next.js配置
│   ├── tailwind.config.js           # Tailwind配置
│   ├── postcss.config.js            # PostCSS配置
│   ├── package.json                 # 依赖管理
│   └── tsconfig.json                # TypeScript配置
│
├── .gitignore                       # Git忽略文件
├── LICENSE                          # Apache 2.0许可证
└── 项目交接文档_SparkLab.md         # 本文档

```

---

## 4. 核心功能模块

### 4.1 用户认证系统

#### 4.1.1 认证流程
```
用户登录 → 后端验证 → 生成JWT Token → 设置Cookie → 前端存储状态
```

#### 4.1.2 JWT Token结构
```go
type Claims struct {
    Subject  string // 用户ID
    Username string // 用户名
    Role     string // 角色: STUDENT, TEACHER, AUTHOR, ADMIN
    jwt.RegisteredClaims
}
```

#### 4.1.3 认证方式
- **Cookie**: `access_token` (HttpOnly, 7天有效期)
- **Header**: `Authorization: Bearer <token>`

#### 4.1.4 权限级别
1. **STUDENT (学生)**: 查看课程、做实验、提交作业
2. **TEACHER (教师)**: 学生权限 + 查看学生进度
3. **AUTHOR (作者)**: 教师权限 + 创建/编辑课程
4. **ADMIN (管理员)**: 所有权限 + 用户管理 + 系统管理

#### 4.1.5 关键代码位置
- 后端: `server/internal/auth/`
- 前端: `web/src/store/useAuthStore.ts`
- 中间件: `server/internal/auth/middleware.go`

---

### 4.2 课程系统

#### 4.2.1 课程类型
- **lab**: 实验课程（需要Docker容器）
- **video**: 视频课程（观看视频）
- **exam**: 试卷考试（在线答题）

#### 4.2.2 课程状态
- **isActive = true**: 开课（学生可见可报名）
- **isActive = false**: 停课（学生不可见）

#### 4.2.3 课程难度
- **beginner**: 初级
- **intermediate**: 中级
- **advanced**: 高级

#### 4.2.4 课程注册流程
```
学生浏览课程 → 点击报名 → 创建Enrollment记录 → 开始学习
```

#### 4.2.5 进度追踪
- **Enrollment.progress**: 0-100 的整数
- **VideoProgress**: 记录视频观看时长
- **Submission**: 记录实验提交和成绩

#### 4.2.6 关键API
```
GET  /courses              # 获取所有课程
GET  /courses/:id          # 获取课程详情
POST /courses/:id/enroll   # 报名课程
GET  /courses/:id/progress # 获取学习进度
```

---

### 4.3 实验系统

#### 4.3.1 实验配置
每个实验包含以下配置：

```typescript
{
  dockerImage: "ubuntu:22.04",        // Docker镜像
  cpuLimit: 1.0,                      // CPU限制（核心数）
  memoryLimit: 512,                   // 内存限制（MB）
  shellCommand: "/bin/bash",          // Shell命令
  portMappings: [                     // 端口映射
    {
      containerPort: 3306,
      hostPort: 3306,
      protocol: "tcp",
      random: false
    }
  ],
  environmentVars: [                  // 环境变量
    {
      name: "MYSQL_ROOT_PASSWORD",
      value: "123456"
    }
  ],
  volumeMounts: [                     // 卷挂载
    {
      hostPath: "/mydata/mysql/data",
      containerPath: "/var/lib/mysql",
      mode: "rw"
    }
  ],
  restartPolicy: "unless-stopped",    // 重启策略
  judgeType: "manual",                // 判题类型: manual, auto
  judgeScript: "/path/to/judge.sh"    // 判题脚本
}
```

#### 4.3.2 容器生命周期
```
创建容器 → 启动容器 → 心跳保活 → 超时停止 → 手动删除
```

#### 4.3.3 心跳机制
- 前端每30秒发送心跳: `POST /containers/:id/heartbeat`
- 后端更新 `lastActiveAt` 字段
- 定时任务检查超时容器并自动停止

#### 4.3.4 Web终端
- **协议**: WebSocket
- **终端库**: xterm.js
- **路径**: `ws://backend/containers/:id/terminal`
- **功能**: 实时交互式Shell

#### 4.3.5 关键API
```
POST   /containers              # 创建容器
GET    /containers              # 获取用户容器列表
GET    /containers/:id          # 获取容器详情
POST   /containers/:id/start    # 启动容器
POST   /containers/:id/stop     # 停止容器
DELETE /containers/:id          # 删除容器
POST   /containers/:id/heartbeat# 心跳保活
GET    /containers/:id/terminal # WebSocket终端
```

---

### 4.4 视频系统

#### 4.4.1 视频上传
- **路径**: `POST /api/upload/video`
- **存储位置**: `web/public/uploads/videos/`
- **文件名**: MD5哈希值
- **支持格式**: MP4

#### 4.4.2 视频播放
- **播放器**: HTML5 `<video>` 标签
- **进度追踪**: 每5秒保存一次观看进度
- **完成条件**: 观看进度 >= 90%

#### 4.4.3 进度保存
```typescript
{
  userId: "user-id",
  labId: "lab-id",
  watchedDuration: 120,    // 已观看秒数
  totalDuration: 300,      // 总时长秒数
  completed: false,        // 是否完成
  lastWatchedAt: "2026-04-11T10:00:00Z"
}
```

---

### 4.5 考试系统

#### 4.5.1 题目类型
- **single**: 单选题
- **multiple**: 多选题
- **judge**: 判断题
- **fill**: 填空题
- **essay**: 简答题

#### 4.5.2 题目结构
```typescript
{
  type: "single",
  title: "题目标题",
  content: "题目内容",
  options: ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
  answer: ["A"],           // 正确答案（JSON数组）
  explanation: "答案解析",
  points: 10,              // 分值
  order: 1                 // 排序
}
```

#### 4.5.3 答题流程
```
加载试卷 → 学生答题 → 提交答案 → 自动判分 → 显示成绩
```

#### 4.5.4 判分规则
- **单选/判断**: 完全正确得分，否则0分
- **多选**: 完全正确得分，否则0分
- **填空**: 字符串完全匹配（忽略首尾空格）
- **简答**: 需要教师手动评分

---

### 4.6 服务器管理

#### 4.6.1 服务器模型
```go
type Server struct {
    ID              string
    Name            string    // 服务器名称
    Host            string    // 主机地址（Agent模式不需要）
    Port            int       // SSH端口（Agent模式不需要）
    Username        string    // SSH用户名
    AuthType        string    // password, key
    Password        string    // Agent Token 或 SSH密码
    PrivateKey      string    // SSH私钥
    Status          string    // online, offline, error, maintenance
    MaxContainers   int       // 最大容器数
    CPUCores        int       // CPU核心数
    CPUModel        string    // CPU型号
    TotalMemory     int       // 总内存（MB）
    ActiveContainers int      // 当前活跃容器数
    CPUUsage        float64   // CPU使用率
    MemoryUsage     float64   // 内存使用率
}
```

#### 4.6.2 资源监控
- **CPU使用率**: 通过 `gopsutil` 获取
- **内存使用率**: 通过 `gopsutil` 获取
- **容器统计**: 通过 Docker SDK 获取
- **更新频率**: 每次刷新时实时获取

#### 4.6.3 关键API
```
POST   /servers                    # 创建服务器
GET    /servers                    # 获取服务器列表
GET    /servers/:id                # 获取服务器详情
POST   /servers/:id/refresh        # 刷新服务器状态
GET    /servers/:id/containers     # 获取服务器容器列表
GET    /servers/:id/images         # 获取服务器镜像列表
POST   /servers/:id/images/pull    # 拉取镜像
POST   /servers/:id/images/build   # 构建镜像
DELETE /servers/:id/images/:imageId# 删除镜像
GET    /servers/:id/networks       # 获取网络列表
POST   /servers/:id/networks       # 创建网络
DELETE /servers/:id/networks/:networkId # 删除网络
```

---

### 4.7 监控系统

#### 4.7.1 资源监控
- **系统资源**: CPU、内存、磁盘、网络
- **Docker资源**: 容器数量、镜像数量、卷数量、网络数量
- **实时流**: Server-Sent Events (SSE)

#### 4.7.2 容器监控
- **容器状态**: running, paused, exited, dead
- **资源使用**: CPU、内存、网络IO、磁盘IO
- **日志查看**: 实时日志流

#### 4.7.3 关键API
```
GET /monitor/resources                      # 获取资源统计
GET /monitor/resources/stream               # 资源统计流（SSE）
GET /monitor/docker/containers              # 获取所有容器
GET /monitor/docker/containers/:id          # 容器详情
GET /monitor/docker/containers/:id/stats    # 容器统计
GET /monitor/docker/containers/:id/stats/stream # 容器统计流
GET /monitor/docker/containers/:id/logs     # 容器日志
POST /monitor/docker/containers/:id/:action # 容器操作
```

---

### 4.8 活动日志系统

#### 4.8.1 记录的操作
- `enroll_course`: 报名课程
- `start_lab`: 开始实验
- `start_video`: 开始观看视频
- `start_exam`: 开始考试
- `submit_lab`: 提交实验
- `complete_video`: 完成视频
- `complete_exam`: 完成考试
- `create_container`: 创建容器
- `stop_container`: 停止容器
- `delete_container`: 删除容器

#### 4.8.2 日志结构
```go
type ActivityLog struct {
    ID         string
    UserID     string
    Action     string    // 操作类型
    TargetType string    // 目标类型: course, lab, video, exam, container
    TargetID   string    // 目标ID
    TargetName string    // 目标名称
    Metadata   string    // JSON格式额外信息
    CreatedAt  time.Time
}
```

#### 4.8.3 查询API
```
GET /auth/activities  # 获取当前用户活动日志
```

---

## 5. 数据库设计

### 5.1 数据库Schema

完整的数据库Schema定义在 `server/prisma/schema.prisma`

#### 5.1.1 核心表关系图

```
User (用户)
  ├─ 1:N → Container (容器)
  ├─ 1:N → Submission (提交)
  ├─ 1:N → Enrollment (课程注册)
  ├─ 1:N → Answer (答案)
  ├─ 1:N → VideoProgress (视频进度)
  └─ 1:N → ActivityLog (活动日志)

Course (课程)
  ├─ 1:N → Lab (实验)
  └─ 1:N → Enrollment (课程注册)

Lab (实验)
  ├─ N:1 → Course (课程)
  ├─ N:1 → Server (服务器)
  ├─ 1:N → Step (步骤)
  ├─ 1:N → Container (容器)
  ├─ 1:N → Submission (提交)
  ├─ 1:N → Question (题目)
  └─ 1:N → VideoProgress (视频进度)

Server (服务器)
  ├─ 1:N → Container (容器)
  └─ 1:N → Lab (实验)

Question (题目)
  ├─ N:1 → Lab (实验)
  └─ 1:N → Answer (答案)

Submission (提交)
  ├─ N:1 → User (用户)
  ├─ N:1 → Lab (实验)
  └─ 1:N → Answer (答案)
```

### 5.2 表结构详解

#### 5.2.1 User (用户表)
```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    displayName   TEXT DEFAULT '未命名',
    email         TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,
    role          TEXT DEFAULT 'STUDENT',  -- STUDENT, TEACHER, ADMIN, AUTHOR
    avatar        TEXT,
    qqNumber      TEXT,                    -- QQ号，用于获取QQ头像
    createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastActiveAt  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 5.2.2 Course (课程表)
```sql
CREATE TABLE courses (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    cover       TEXT,
    type        TEXT DEFAULT 'lab',        -- lab, video, exam
    difficulty  TEXT DEFAULT 'beginner',   -- beginner, intermediate, advanced
    duration    INTEGER DEFAULT 0,         -- 预计完成时间（分钟）
    isActive    BOOLEAN DEFAULT TRUE,      -- 是否开课
    createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 5.2.3 Lab (实验表)
```sql
CREATE TABLE labs (
    id              TEXT PRIMARY KEY,
    courseId        TEXT NOT NULL,
    type            TEXT DEFAULT 'lab',
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    content         TEXT DEFAULT '',       -- Markdown内容
    difficulty      TEXT DEFAULT 'beginner',
    order           INTEGER DEFAULT 0,
    points          INTEGER DEFAULT 100,
    timeLimit       INTEGER DEFAULT 60,
    
    -- 视频相关
    videoUrl        TEXT,
    videoDuration   INTEGER DEFAULT 0,
    
    -- 服务器配置
    serverId        TEXT,
    
    -- 容器配置
    dockerImage     TEXT DEFAULT 'ubuntu:22.04',
    cpuLimit        REAL DEFAULT 1.0,
    memoryLimit     INTEGER DEFAULT 512,
    shellCommand    TEXT DEFAULT '/bin/bash',
    portMappings    TEXT,                  -- JSON格式
    environmentVars TEXT,                  -- JSON格式
    volumeMounts    TEXT,                  -- JSON格式
    restartPolicy   TEXT DEFAULT 'unless-stopped',
    
    -- 判题配置
    judgeScript     TEXT,
    judgeType       TEXT DEFAULT 'manual',
    
    createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE SET NULL
);
```

#### 5.2.4 Container (容器表)
```sql
CREATE TABLE containers (
    id           TEXT PRIMARY KEY,
    userId       TEXT NOT NULL,
    labId        TEXT NOT NULL,
    serverId     TEXT,
    containerId  TEXT UNIQUE NOT NULL,     -- Docker容器ID
    status       TEXT DEFAULT 'creating',  -- creating, running, stopped, error
    portMappings TEXT,                     -- JSON格式
    cpuLimit     REAL DEFAULT 1.0,
    memoryLimit  INTEGER DEFAULT 512,
    createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
    startedAt    DATETIME,
    stoppedAt    DATETIME,
    lastActiveAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    autoStopAt   DATETIME,
    
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (labId) REFERENCES labs(id) ON DELETE CASCADE,
    FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE SET NULL
);
```

#### 5.2.5 Server (服务器表)
```sql
CREATE TABLE servers (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    host             TEXT DEFAULT '',
    port             INTEGER DEFAULT 0,
    username         TEXT DEFAULT '',
    authType         TEXT DEFAULT 'password',
    password         TEXT,
    privateKey       TEXT,
    status           TEXT DEFAULT 'offline',
    lastCheckAt      DATETIME DEFAULT CURRENT_TIMESTAMP,
    maxContainers    INTEGER DEFAULT 10,
    cpuCores         INTEGER DEFAULT 0,
    cpuModel         TEXT,
    totalMemory      INTEGER DEFAULT 0,
    activeContainers INTEGER DEFAULT 0,
    cpuUsage         REAL DEFAULT 0.0,
    memoryUsage      REAL DEFAULT 0.0,
    cpuIdlePrev      INTEGER DEFAULT 0,
    cpuTotalPrev     INTEGER DEFAULT 0,
    createdAt        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt        DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 5.2.6 Question (题目表)
```sql
CREATE TABLE questions (
    id          TEXT PRIMARY KEY,
    labId       TEXT NOT NULL,
    type        TEXT DEFAULT 'single',     -- single, multiple, judge, fill, essay
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    options     TEXT,                      -- JSON格式
    answer      TEXT NOT NULL,             -- JSON格式
    explanation TEXT,
    points      INTEGER DEFAULT 10,
    order       INTEGER DEFAULT 0,
    createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (labId) REFERENCES labs(id) ON DELETE CASCADE
);
```

#### 5.2.7 Answer (答案表)
```sql
CREATE TABLE answers (
    id           TEXT PRIMARY KEY,
    userId       TEXT NOT NULL,
    questionId   TEXT NOT NULL,
    submissionId TEXT NOT NULL,
    answer       TEXT NOT NULL,            -- JSON格式
    isCorrect    BOOLEAN DEFAULT FALSE,
    score        INTEGER DEFAULT 0,
    createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (questionId) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (submissionId) REFERENCES submissions(id) ON DELETE CASCADE
);
```

#### 5.2.8 VideoProgress (视频进度表)
```sql
CREATE TABLE video_progress (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL,
    labId           TEXT NOT NULL,
    watchedDuration INTEGER DEFAULT 0,
    totalDuration   INTEGER DEFAULT 0,
    completed       BOOLEAN DEFAULT FALSE,
    lastWatchedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(userId, labId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (labId) REFERENCES labs(id) ON DELETE CASCADE
);
```

#### 5.2.9 ActivityLog (活动日志表)
```sql
CREATE TABLE activity_logs (
    id         TEXT PRIMARY KEY,
    userId     TEXT NOT NULL,
    action     TEXT NOT NULL,
    targetType TEXT,
    targetId   TEXT,
    targetName TEXT,
    metadata   TEXT,                       -- JSON格式
    createdAt  DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_activity_logs_user_created ON activity_logs(userId, createdAt);
```

### 5.3 级联删除规则

#### 5.3.1 删除用户
```
删除User → 级联删除:
  - Container (用户的所有容器)
  - Submission (用户的所有提交)
  - Enrollment (用户的所有课程注册)
  - Answer (用户的所有答案)
  - VideoProgress (用户的所有视频进度)
  - ActivityLog (用户的所有活动日志)
```

#### 5.3.2 删除课程
```
删除Course → 级联删除:
  - Lab (课程的所有实验)
  - Enrollment (课程的所有注册记录)
  
删除Lab → 级联删除:
  - Step (实验的所有步骤)
  - Container (实验的所有容器)
  - Submission (实验的所有提交)
  - Question (实验的所有题目)
  - VideoProgress (实验的所有视频进度)
  
删除Question → 级联删除:
  - Answer (题目的所有答案)
```

#### 5.3.3 删除服务器
```
删除Server → 设置为NULL:
  - Container.serverId
  - Lab.serverId
```

### 5.4 数据库迁移

#### 5.4.1 迁移历史
```
20260401112546_init                    # 初始化数据库
20260402000000_add_cpu_tracking        # 添加CPU追踪字段
20260407000000_add_composes            # 添加Compose支持（已废弃）
20260407100000_add_author_role         # 添加AUTHOR角色
20260407100857_remove_snapshots        # 移除快照功能
20260408000000_add_course_types        # 添加课程类型
20260409000000_add_soft_delete         # 添加软删除（已改为isActive）
20260409100000_change_to_active_status # 改为isActive状态
20260409120000_add_activity_logs       # 添加活动日志
```

#### 5.4.2 执行迁移
```bash
cd server
npx prisma migrate dev    # 开发环境
npx prisma migrate deploy # 生产环境
```

---

## 6. API接口文档

### 6.1 认证接口

#### 6.1.1 用户注册
```http
POST /auth/register
Content-Type: application/json

{
  "username": "student1",
  "displayName": "张三",
  "password": "password123",
  "qqNumber": "123456789"  // 可选
}

Response 200:
{
  "message": "注册成功"
}
```

#### 6.1.2 用户登录
```http
POST /auth/login
Content-Type: application/json

{
  "username": "student1",
  "password": "password123"
}

Response 200:
{
  "message": "登录成功",
  "user": {
    "id": "uuid",
    "username": "student1",
    "displayName": "张三",
    "role": "STUDENT",
    "qqNumber": "123456789",
    "avatar": null
  }
}

Set-Cookie: access_token=<jwt_token>; HttpOnly; Max-Age=604800
```

#### 6.1.3 获取用户信息
```http
GET /auth/profile
Cookie: access_token=<jwt_token>

Response 200:
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "username": "student1",
    "displayName": "张三",
    "role": "STUDENT",
    "email": "student1@example.com",
    "qqNumber": "123456789",
    "avatar": null
  }
}
```

#### 6.1.4 退出登录
```http
POST /auth/logout
Cookie: access_token=<jwt_token>

Response 200:
{
  "message": "退出成功"
}

Set-Cookie: access_token=; Max-Age=0
```

#### 6.1.5 获取用户统计
```http
GET /auth/stats
Cookie: access_token=<jwt_token>

Response 200:
{
  "enrolledCourses": 5,
  "completedLabs": 12,
  "activeContainers": 2,
  "totalPoints": 850
}
```

#### 6.1.6 获取用户活动日志
```http
GET /auth/activities
Cookie: access_token=<jwt_token>

Response 200:
{
  "activities": [
    {
      "id": "uuid",
      "action": "start_lab",
      "targetType": "lab",
      "targetId": "lab-uuid",
      "targetName": "Docker基础实验",
      "createdAt": "2026-04-11T10:00:00Z"
    }
  ]
}
```

---

### 6.2 课程接口

#### 6.2.1 获取所有课程
```http
GET /courses

Response 200:
{
  "courses": [
    {
      "id": "uuid",
      "title": "Docker容器技术",
      "description": "学习Docker容器的基本使用",
      "cover": "https://example.com/cover.jpg",
      "type": "lab",
      "difficulty": "beginner",
      "duration": 120,
      "isActive": true,
      "labCount": 10,
      "enrolledCount": 50
    }
  ]
}
```

#### 6.2.2 获取课程详情
```http
GET /courses/:id

Response 200:
{
  "course": {
    "id": "uuid",
    "title": "Docker容器技术",
    "description": "学习Docker容器的基本使用",
    "cover": "https://example.com/cover.jpg",
    "type": "lab",
    "difficulty": "beginner",
    "duration": 120,
    "isActive": true,
    "labs": [
      {
        "id": "lab-uuid",
        "title": "Docker基础实验",
        "description": "学习Docker基本命令",
        "order": 1,
        "points": 100
      }
    ]
  },
  "enrolled": true,
  "progress": 60
}
```

#### 6.2.3 报名课程
```http
POST /courses/:id/enroll
Cookie: access_token=<jwt_token>

Response 200:
{
  "message": "报名成功",
  "enrollment": {
    "id": "uuid",
    "courseId": "course-uuid",
    "userId": "user-uuid",
    "progress": 0,
    "startedAt": "2026-04-11T10:00:00Z"
  }
}
```

#### 6.2.4 获取课程进度
```http
GET /courses/:id/progress
Cookie: access_token=<jwt_token>

Response 200:
{
  "progress": 60,
  "completedLabs": 6,
  "totalLabs": 10,
  "enrollment": {
    "startedAt": "2026-04-01T10:00:00Z",
    "completedAt": null
  }
}
```

---

### 6.3 实验接口

#### 6.3.1 获取实验详情
```http
GET /labs/:id

Response 200:
{
  "lab": {
    "id": "uuid",
    "courseId": "course-uuid",
    "type": "lab",
    "title": "Docker基础实验",
    "description": "学习Docker基本命令",
    "content": "# 实验内容\n\n...",
    "difficulty": "beginner",
    "points": 100,
    "timeLimit": 60,
    "dockerImage": "ubuntu:22.04",
    "cpuLimit": 1.0,
    "memoryLimit": 512,
    "portMappings": [...],
    "environmentVars": [...],
    "volumeMounts": [...]
  },
  "container": {
    "id": "container-uuid",
    "status": "running",
    "portMappings": [...]
  },
  "submission": {
    "score": 85,
    "status": "passed"
  }
}
```

#### 6.3.2 获取课程的所有实验
```http
GET /labs/course/:courseId

Response 200:
{
  "labs": [
    {
      "id": "uuid",
      "title": "Docker基础实验",
      "description": "学习Docker基本命令",
      "order": 1,
      "points": 100,
      "completed": true,
      "score": 85
    }
  ]
}
```

#### 6.3.3 提交实验
```http
POST /labs/:id/submit
Cookie: access_token=<jwt_token>
Content-Type: application/json

{
  "code": "#!/bin/bash\necho 'Hello World'"  // 可选
}

Response 200:
{
  "message": "提交成功",
  "submission": {
    "id": "uuid",
    "score": 85,
    "maxScore": 100,
    "status": "passed",
    "output": "测试通过",
    "submittedAt": "2026-04-11T10:00:00Z"
  }
}
```

---

### 6.4 容器接口

#### 6.4.1 创建容器
```http
POST /containers
Cookie: access_token=<jwt_token>
Content-Type: application/json

{
  "labId": "lab-uuid"
}

Response 200:
{
  "message": "容器创建成功",
  "container": {
    "id": "uuid",
    "containerId": "docker-container-id",
    "status": "running",
    "portMappings": [
      {
        "containerPort": 80,
        "hostPort": 8080,
        "protocol": "tcp"
      }
    ],
    "createdAt": "2026-04-11T10:00:00Z"
  }
}
```

#### 6.4.2 获取用户容器列表
```http
GET /containers
Cookie: access_token=<jwt_token>

Response 200:
{
  "containers": [
    {
      "id": "uuid",
      "containerId": "docker-container-id",
      "status": "running",
      "lab": {
        "id": "lab-uuid",
        "title": "Docker基础实验"
      },
      "createdAt": "2026-04-11T10:00:00Z",
      "lastActiveAt": "2026-04-11T10:30:00Z"
    }
  ]
}
```

#### 6.4.3 启动容器
```http
POST /containers/:id/start
Cookie: access_token=<jwt_token>

Response 200:
{
  "message": "容器启动成功"
}
```

#### 6.4.4 停止容器
```http
POST /containers/:id/stop
Cookie: access_token=<jwt_token>

Response 200:
{
  "message": "容器停止成功"
}
```

#### 6.4.5 删除容器
```http
DELETE /containers/:id
Cookie: access_token=<jwt_token>

Response 200:
{
  "message": "容器删除成功"
}
```

#### 6.4.6 容器心跳
```http
POST /containers/:id/heartbeat
Cookie: access_token=<jwt_token>

Response 200:
{
  "message": "心跳成功",
  "lastActiveAt": "2026-04-11T10:30:00Z"
}
```

#### 6.4.7 WebSocket终端
```
ws://backend/containers/:id/terminal?token=<jwt_token>

连接成功后:
- 发送: {"type": "input", "data": "ls -la\n"}
- 接收: {"type": "output", "data": "total 48\ndrwxr-xr-x..."}
```

---

### 6.5 管理员接口

#### 6.5.1 获取统计数据
```http
GET /admin/stats
Cookie: access_token=<jwt_token>

Response 200:
{
  "totalUsers": 100,
  "totalCourses": 20,
  "totalLabs": 150,
  "totalContainers": 50,
  "activeContainers": 25,
  "totalServers": 3,
  "onlineServers": 2
}
```

#### 6.5.2 用户管理
```http
# 获取所有用户
GET /admin/users

# 创建用户
POST /admin/users
{
  "username": "newuser",
  "displayName": "新用户",
  "password": "password123",
  "role": "STUDENT",
  "qqNumber": "123456789"
}

# 更新用户
PUT /admin/users/:id
{
  "displayName": "更新后的名字",
  "role": "TEACHER"
}

# 删除用户
DELETE /admin/users/:id
```

#### 6.5.3 课程管理
```http
# 创建课程
POST /admin/courses
{
  "title": "新课程",
  "description": "课程描述",
  "type": "lab",
  "difficulty": "beginner",
  "duration": 120,
  "isActive": true
}

# 更新课程
PUT /admin/courses/:id
{
  "title": "更新后的标题",
  "isActive": false
}

# 开课/停课
PATCH /admin/courses/:id/toggle-active

# 删除课程（已废弃，使用toggle-active）
DELETE /admin/courses/:id
```

#### 6.5.4 实验管理
```http
# 创建实验
POST /admin/labs
{
  "courseId": "course-uuid",
  "type": "lab",
  "title": "新实验",
  "description": "实验描述",
  "content": "# 实验内容",
  "dockerImage": "ubuntu:22.04",
  "cpuLimit": 1.0,
  "memoryLimit": 512,
  "portMappings": [...],
  "environmentVars": [...],
  "volumeMounts": [...]
}

# 更新实验
PUT /admin/labs/:id
{
  "title": "更新后的标题",
  "content": "更新后的内容"
}

# 删除实验（已废弃）
DELETE /admin/labs/:id
```

#### 6.5.5 容器管理
```http
# 获取所有容器
GET /admin/containers

# 强制停止容器
POST /admin/containers/:id/force-stop
```

---

### 6.6 服务器接口

#### 6.6.1 服务器管理
```http
# 创建服务器
POST /servers
{
  "name": "实验服务器1",
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "authType": "password",
  "password": "password123"
}

# 获取服务器列表
GET /servers

# 获取服务器详情
GET /servers/:id

# 刷新服务器状态
POST /servers/:id/refresh

# 更新服务器
PUT /servers/:id
{
  "name": "更新后的名称",
  "status": "maintenance"
}

# 删除服务器
DELETE /servers/:id
```

#### 6.6.2 服务器容器管理
```http
# 获取服务器容器列表
GET /servers/:id/containers

# 启动容器
POST /servers/:id/containers/:containerId/start

# 停止容器
POST /servers/:id/containers/:containerId/stop

# 删除容器
DELETE /servers/:id/containers/:containerId

# 容器终端
GET /servers/:id/containers/:containerId/terminal
```

#### 6.6.3 服务器镜像管理
```http
# 获取镜像列表
GET /servers/:id/images

# 拉取镜像
POST /servers/:id/images/pull
{
  "image": "ubuntu:22.04"
}

# 构建镜像
POST /servers/:id/images/build
{
  "dockerfile": "FROM ubuntu:22.04\nRUN apt-get update",
  "tag": "myimage:latest"
}

# 删除镜像
DELETE /servers/:id/images/:imageId
```

#### 6.6.4 服务器网络管理
```http
# 获取网络列表
GET /servers/:id/networks

# 创建网络
POST /servers/:id/networks
{
  "name": "my-network",
  "driver": "bridge"
}

# 删除网络
DELETE /servers/:id/networks/:networkId
```

---

### 6.7 监控接口

#### 6.7.1 资源监控
```http
# 获取资源统计
GET /monitor/resources

Response 200:
{
  "cpu": {
    "usage": 45.5,
    "cores": 8
  },
  "memory": {
    "total": 16384,
    "used": 8192,
    "free": 8192,
    "usage": 50.0
  },
  "disk": {
    "total": 512000,
    "used": 256000,
    "free": 256000,
    "usage": 50.0
  },
  "docker": {
    "containers": 10,
    "images": 20,
    "volumes": 5,
    "networks": 3
  }
}

# 资源统计流（SSE）
GET /monitor/resources/stream
```

#### 6.7.2 Docker容器监控
```http
# 获取所有容器
GET /monitor/docker/containers

# 容器详情
GET /monitor/docker/containers/:id

# 容器统计
GET /monitor/docker/containers/:id/stats

# 容器统计流（SSE）
GET /monitor/docker/containers/:id/stats/stream

# 容器日志
GET /monitor/docker/containers/:id/logs?tail=100

# 容器操作
POST /monitor/docker/containers/:id/start
POST /monitor/docker/containers/:id/stop
POST /monitor/docker/containers/:id/restart
```

---

### 6.8 存储卷接口

```http
# 获取存储卷列表
GET /volumes?serverId=server-uuid

# 获取存储卷详情
GET /volumes/:name?serverId=server-uuid

# 创建存储卷
POST /volumes
{
  "serverId": "server-uuid",
  "name": "my-volume",
  "driver": "local",
  "labels": {
    "project": "sparklab"
  },
  "options": {
    "type": "nfs"
  }
}

# 删除存储卷
DELETE /volumes/:name?serverId=server-uuid&force=true
```

---

## 7. 部署指南

### 7.1 环境要求

#### 7.1.1 服务器要求
- **操作系统**: Linux (Ubuntu 20.04+ 推荐)
- **CPU**: 4核心以上
- **内存**: 8GB以上
- **磁盘**: 100GB以上
- **Docker**: 20.10+
- **Go**: 1.25.0+
- **Node.js**: 18.0+

#### 7.1.2 网络要求
- 开放端口: 3000 (前端), 3001 (后端)
- WebSocket支持
- 容器端口映射范围: 30000-40000

### 7.2 本地开发环境搭建

#### 7.2.1 克隆项目
```bash
git clone <repository-url>
cd SparkLab
```

#### 7.2.2 后端配置
```bash
cd server

# 安装Go依赖
go mod download

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库路径、JWT密钥等

# 安装Prisma CLI
npm install

# 执行数据库迁移
npx prisma migrate dev

# 生成种子数据（可选）
go run cmd/seed/main.go

# 启动后端服务
go run cmd/server/main.go
```

后端服务将在 `http://localhost:3001` 启动

#### 7.2.3 前端配置
```bash
cd web

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置后端URL

# 启动开发服务器
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

### 7.3 生产环境部署

#### 7.3.1 使用Docker Compose部署

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - DATABASE_URL=file:./prisma/spark_lab.db?_fk=1
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRES_IN=7d
      - WEB_URL=http://frontend:3000
    volumes:
      - ./server/prisma:/app/prisma
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - SERVER_URL=http://backend:3001
      - NEXT_PUBLIC_BACKEND_WS_URL=<your-server-ip>:3001
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  db-data:
```

创建后端 `Dockerfile` (`server/Dockerfile`):

```dockerfile
FROM golang:1.25-alpine AS builder

WORKDIR /app

# 安装依赖
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 构建
RUN CGO_ENABLED=1 GOOS=linux go build -o server cmd/server/main.go

FROM alpine:latest

WORKDIR /app

# 安装运行时依赖
RUN apk --no-cache add ca-certificates sqlite

# 复制二进制文件
COPY --from=builder /app/server .
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

CMD ["./server"]
```

创建前端 `Dockerfile` (`web/Dockerfile`):

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

FROM node:18-alpine

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
```

启动服务:

```bash
# 设置JWT密钥
export JWT_SECRET="your-super-secret-jwt-key"

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

#### 7.3.2 使用Nginx反向代理

创建 `/etc/nginx/sites-available/sparklab`:

```nginx
upstream backend {
    server localhost:3001;
}

upstream frontend {
    server localhost:3000;
}

server {
    listen 80;
    server_name sparklab.example.com;

    # 前端
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端API
    location /server/ {
        proxy_pass http://backend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /containers/ {
        proxy_pass http://backend/containers/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

启用配置:

```bash
sudo ln -s /etc/nginx/sites-available/sparklab /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 7.3.3 配置HTTPS (Let's Encrypt)

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d sparklab.example.com

# 自动续期
sudo certbot renew --dry-run
```

### 7.4 数据库迁移

#### 7.4.1 从SQLite迁移到PostgreSQL

1. 修改 `server/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. 更新环境变量:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/sparklab?schema=public"
```

3. 执行迁移:

```bash
npx prisma migrate deploy
```

4. 导入数据（如果需要）:

```bash
# 从SQLite导出
sqlite3 spark_lab.db .dump > dump.sql

# 转换并导入PostgreSQL
# 需要手动调整SQL语法差异
```

### 7.5 性能优化

#### 7.5.1 数据库优化
```sql
-- 添加索引
CREATE INDEX idx_containers_user_id ON containers(userId);
CREATE INDEX idx_containers_lab_id ON containers(labId);
CREATE INDEX idx_enrollments_user_id ON enrollments(userId);
CREATE INDEX idx_enrollments_course_id ON enrollments(courseId);
CREATE INDEX idx_submissions_user_id ON submissions(userId);
CREATE INDEX idx_submissions_lab_id ON submissions(labId);
```

#### 7.5.2 前端优化
- 启用Next.js静态生成 (SSG)
- 使用CDN加速静态资源
- 启用图片优化 (next/image)
- 代码分割和懒加载

#### 7.5.3 后端优化
- 启用Gin的Release模式
- 使用连接池
- 启用GZIP压缩
- 实现缓存机制（Redis）

### 7.6 监控和日志

#### 7.6.1 日志配置

后端日志:
```go
// 使用logrus或zap
import "github.com/sirupsen/logrus"

log := logrus.New()
log.SetFormatter(&logrus.JSONFormatter{})
log.SetOutput(os.Stdout)
log.SetLevel(logrus.InfoLevel)
```

前端日志:
```typescript
// 使用winston或pino
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

#### 7.6.2 监控工具
- **Prometheus**: 指标收集
- **Grafana**: 可视化监控
- **Sentry**: 错误追踪
- **ELK Stack**: 日志分析

### 7.7 备份策略

#### 7.7.1 数据库备份
```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/sparklab"

# SQLite备份
cp server/prisma/spark_lab.db $BACKUP_DIR/spark_lab_$DATE.db

# PostgreSQL备份
# pg_dump -U user -d sparklab > $BACKUP_DIR/sparklab_$DATE.sql

# 压缩
gzip $BACKUP_DIR/spark_lab_$DATE.db

# 删除7天前的备份
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
```

#### 7.7.2 定时备份
```bash
# 添加到crontab
crontab -e

# 每天凌晨2点备份
0 2 * * * /path/to/backup.sh
```

---

### 7.4 GitHub 发布与更新流程

SparkLab 使用仓库根目录的 `update-manifest.json` 作为发布清单。部署主机不会只看 Git 提交号，而是从 GitHub 读取发布清单里的版本号、公告和更新日志。

#### 7.4.1 发布新版本

每次更新代码后，请同步修改 `update-manifest.json`：

```json
{
  "version": "0.3.1",
  "releasedAt": "2026-06-09T20:00:00+08:00",
  "title": "本次更新标题",
  "mandatory": false,
  "announcement": {
    "enabled": true,
    "level": "info",
    "title": "公告标题",
    "message": "给用户看的公告内容"
  },
  "changelog": [
    {
      "version": "0.3.1",
      "date": "2026-06-09",
      "title": "更新日志标题",
      "items": ["更新点 1", "更新点 2"]
    }
  ]
}
```

发布步骤：

```bash
git add .
git commit -m "Release v0.3.1"
git push origin main
```

#### 7.4.2 部署端检查更新

- 前端每次加载时会调用 `/updates/check`，从 GitHub 读取公告和最新版本信息。
- 管理员首页会显示当前版本、GitHub 最新版本、更新日志和本地工作区状态。
- 管理员点击“更新”后，后端会执行：
  1. `git fetch origin main`
  2. `git pull --ff-only origin main`
  3. 根据系统执行 `scripts/update.sh` 或 `scripts/update.ps1`

更新脚本默认会安装依赖、构建后端和前端。如果配置了 `SPARKLAB_RESTART_COMMAND`，构建成功后会执行该重启命令；否则需要手动重启服务。

#### 7.4.3 推荐部署变量

```bash
GITHUB_REPO="opshenyi/SparkLab"
GITHUB_BRANCH="main"
GITHUB_TOKEN=""                       # 私有仓库或提高额度时填写
APP_REPO_DIR="/opt/SparkLab"          # 服务不在仓库目录内启动时填写
UPDATE_CHECK_CACHE_SECONDS=300
UPDATE_SCRIPT_TIMEOUT_SECONDS=600
SPARKLAB_RESTART_COMMAND="systemctl restart sparklab-backend sparklab-web"
```

> 自动更新要求部署目录是干净 Git 工作区。如果存在未提交改动，系统会拒绝更新，避免覆盖本地配置或临时改动。

---

## 8. 开发指南

### 8.1 代码规范

#### 8.1.1 Go代码规范
- 遵循 [Effective Go](https://golang.org/doc/effective_go.html)
- 使用 `gofmt` 格式化代码
- 使用 `golint` 检查代码质量
- 错误处理: 总是检查错误，不要忽略
- 命名规范:
  - 包名: 小写，单个单词
  - 变量名: 驼峰命名 (camelCase)
  - 常量名: 驼峰命名或全大写
  - 接口名: 以 `er` 结尾 (如 `Reader`, `Writer`)

#### 8.1.2 TypeScript代码规范
- 遵循 [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- 使用 ESLint 和 Prettier
- 类型定义: 优先使用 `interface` 而非 `type`
- 组件命名: PascalCase
- 文件命名: kebab-case 或 PascalCase
- 使用函数式组件和Hooks

#### 8.1.3 Git提交规范
```
<type>(<scope>): <subject>

<body>

<footer>
```

类型 (type):
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

示例:
```
feat(container): 添加容器自动回收功能

- 实现心跳检测机制
- 添加定时任务清理超时容器
- 更新容器状态管理

Closes #123
```

### 8.2 添加新功能

#### 8.2.1 添加新的API接口

1. 定义数据模型 (`server/internal/model/models.go`):
```go
type NewFeature struct {
    ID        string    `gorm:"primaryKey" json:"id"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
}
```

2. 创建Handler (`server/internal/handler/new_feature.go`):
```go
func (h *Handler) CreateNewFeature(c *gin.Context) {
    var req struct {
        Name string `json:"name" binding:"required"`
    }
    
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"message": "Invalid request"})
        return
    }
    
    feature := &model.NewFeature{
        ID:   uuid.New().String(),
        Name: req.Name,
    }
    
    if err := h.db.Create(feature).Error; err != nil {
        c.JSON(500, gin.H{"message": "Failed to create"})
        return
    }
    
    c.JSON(200, gin.H{"feature": feature})
}
```

3. 注册路由 (`server/internal/router/router.go`):
```go
featureGroup := r.Group("/features")
featureGroup.Use(auth.JWTAuth(cfg.JWTSecret))
{
    featureGroup.POST("", h.CreateNewFeature)
    featureGroup.GET("", h.GetNewFeatures)
    featureGroup.GET("/:id", h.GetNewFeature)
    featureGroup.PUT("/:id", h.UpdateNewFeature)
    featureGroup.DELETE("/:id", h.DeleteNewFeature)
}
```

4. 前端API封装 (`web/src/lib/api.ts`):
```typescript
export const featureAPI = {
  create: (data: { name: string }) =>
    api.post('/features', data),
  
  getAll: () =>
    api.get('/features'),
  
  getOne: (id: string) =>
    api.get(`/features/${id}`),
  
  update: (id: string, data: any) =>
    api.put(`/features/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/features/${id}`),
};
```

5. 创建前端页面 (`web/src/app/features/page.tsx`):
```typescript
'use client';

import { useEffect, useState } from 'react';
import { featureAPI } from '@/lib/api';

export default function FeaturesPage() {
  const [features, setFeatures] = useState([]);
  
  useEffect(() => {
    loadFeatures();
  }, []);
  
  const loadFeatures = async () => {
    const response = await featureAPI.getAll();
    setFeatures(response.data.features);
  };
  
  return (
    <div>
      <h1>Features</h1>
      {features.map(feature => (
        <div key={feature.id}>{feature.name}</div>
      ))}
    </div>
  );
}
```

#### 8.2.2 添加数据库迁移

1. 修改 `server/prisma/schema.prisma`:
```prisma
model NewFeature {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  
  @@map("new_features")
}
```

2. 创建迁移:
```bash
cd server
npx prisma migrate dev --name add_new_feature
```

3. 更新Go模型 (`server/internal/model/models.go`)

4. 更新数据库初始化 (`server/internal/db/db.go`):
```go
err = db.AutoMigrate(
    &model.User{},
    &model.Course{},
    // ... 其他模型
    &model.NewFeature{},
)
```

### 8.3 调试技巧

#### 8.3.1 后端调试

使用Delve调试器:
```bash
# 安装Delve
go install github.com/go-delve/delve/cmd/dlv@latest

# 启动调试
dlv debug cmd/server/main.go
```

在代码中添加断点:
```go
import "runtime/debug"

func SomeFunction() {
    debug.PrintStack()  // 打印调用栈
    // ... 代码
}
```

#### 8.3.2 前端调试

使用Chrome DevTools:
- 在浏览器中按 F12 打开开发者工具
- 使用 `console.log()` 输出调试信息
- 使用 `debugger` 语句设置断点

使用React DevTools:
```bash
# 安装React DevTools扩展
# Chrome: https://chrome.google.com/webstore/detail/react-developer-tools/
```

#### 8.3.3 WebSocket调试

使用浏览器控制台:
```javascript
// 连接WebSocket
const ws = new WebSocket('ws://localhost:3001/containers/xxx/terminal');

ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Received:', e.data);
ws.onerror = (e) => console.error('Error:', e);
ws.onclose = () => console.log('Closed');

// 发送消息
ws.send(JSON.stringify({ type: 'input', data: 'ls -la\n' }));
```

### 8.4 测试

#### 8.4.1 后端单元测试

创建测试文件 (`server/internal/handler/auth_test.go`):
```go
package handler

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestLogin(t *testing.T) {
    // 设置测试环境
    db := setupTestDB()
    h := New(db, &config.Config{})
    
    // 创建测试用户
    user := &model.User{
        Username: "testuser",
        Password: "hashedpassword",
    }
    db.Create(user)
    
    // 测试登录
    // ... 测试代码
    
    assert.NotNil(t, user)
}
```

运行测试:
```bash
cd server
go test ./...
```

#### 8.4.2 前端单元测试

使用Jest和React Testing Library:

创建测试文件 (`web/src/components/__tests__/Sidebar.test.tsx`):
```typescript
import { render, screen } from '@testing-library/react';
import Sidebar from '../Sidebar';

describe('Sidebar', () => {
  it('renders navigation items', () => {
    render(<Sidebar />);
    expect(screen.getByText('仪表盘')).toBeInTheDocument();
    expect(screen.getByText('课程中心')).toBeInTheDocument();
  });
});
```

运行测试:
```bash
cd web
npm test
```

#### 8.4.3 集成测试

使用Postman或curl测试API:
```bash
# 登录
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -c cookies.txt

# 获取课程列表
curl -X GET http://localhost:3001/courses \
  -b cookies.txt
```

### 8.5 常用命令

#### 8.5.1 后端命令
```bash
# 运行主服务器
go run cmd/server/main.go

# 生成种子数据
go run cmd/seed/main.go

# 清理容器
go run cmd/cleanup/main.go

# 清理课程注册
go run cmd/cleanup-enrollments/main.go

# 测试级联删除
go run cmd/test-cascade/main.go

# 格式化代码
gofmt -w .

# 检查代码
golint ./...

# 运行测试
go test ./...

# 构建
go build -o sparklab cmd/server/main.go
```

#### 8.5.2 前端命令
```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint

# 格式化代码
npm run format

# 运行测试
npm test
```

#### 8.5.3 数据库命令
```bash
# 创建迁移
npx prisma migrate dev --name migration_name

# 应用迁移
npx prisma migrate deploy

# 重置数据库
npx prisma migrate reset

# 查看数据库
npx prisma studio

# 生成Prisma Client
npx prisma generate
```

### 8.6 故障排查

#### 8.6.1 常见问题

1. **容器无法创建**
   - 检查Docker服务是否运行: `systemctl status docker`
   - 检查Docker权限: `usermod -aG docker $USER`
   - 查看Docker日志: `journalctl -u docker`

2. **WebSocket连接失败**
   - 检查防火墙设置
   - 检查Nginx配置中的WebSocket支持
   - 查看浏览器控制台错误信息

3. **数据库连接失败**
   - 检查DATABASE_URL配置
   - 确认数据库文件权限
   - 查看后端日志

4. **前端无法连接后端**
   - 检查CORS配置
   - 确认后端服务运行状态
   - 检查环境变量配置

#### 8.6.2 日志查看

后端日志:
```bash
# 查看服务日志
journalctl -u sparklab-backend -f

# 查看Docker日志
docker logs -f sparklab-backend
```

前端日志:
```bash
# 查看服务日志
journalctl -u sparklab-frontend -f

# 查看Docker日志
docker logs -f sparklab-frontend
```

---

## 9. 常见问题

### 9.1 部署相关

**Q: 如何修改默认端口？**

A: 修改环境变量文件:
```bash
# server/.env
PORT=3001

# web/.env
# 前端端口在 package.json 中修改
# "dev": "next dev -p 3000"
```

**Q: 如何配置多个前端域名？**

A: 在 `server/.env` 中配置多个域名（逗号分隔）:
```bash
WEB_URL="http://localhost:3000,http://10.0.0.1:3000,https://sparklab.example.com"
```

**Q: 如何启用HTTPS？**

A: 使用Nginx反向代理 + Let's Encrypt证书（参见7.3.3节）

---

### 9.2 功能相关

**Q: 如何添加新的用户角色？**

A: 
1. 在数据库中添加新角色（修改User.role字段）
2. 在后端添加权限检查中间件
3. 在前端添加角色判断逻辑

**Q: 如何自定义容器配置？**

A: 在创建实验时配置以下字段:
- `dockerImage`: Docker镜像
- `cpuLimit`: CPU限制
- `memoryLimit`: 内存限制
- `portMappings`: 端口映射（JSON格式）
- `environmentVars`: 环境变量（JSON格式）
- `volumeMounts`: 卷挂载（JSON格式）

**Q: 如何实现自动判题？**

A: 
1. 设置 `judgeType` 为 `auto`
2. 编写判题脚本并上传到服务器
3. 设置 `judgeScript` 为脚本路径
4. 在提交时后端会执行脚本并返回结果

**Q: 如何限制容器运行时间？**

A: 
1. 前端定时发送心跳: `POST /containers/:id/heartbeat`
2. 后端更新 `lastActiveAt` 字段
3. 定时任务检查超时容器并自动停止

---

### 9.3 性能相关

**Q: 如何提高容器创建速度？**

A:
1. 预先拉取常用镜像
2. 使用本地镜像仓库
3. 优化Docker配置（使用overlay2存储驱动）
4. 增加服务器资源

**Q: 如何优化数据库查询性能？**

A:
1. 添加索引（参见7.5.1节）
2. 使用连接池
3. 实现查询缓存（Redis）
4. 优化查询语句（避免N+1问题）

**Q: 如何处理大量并发用户？**

A:
1. 使用负载均衡（Nginx）
2. 横向扩展后端服务
3. 使用消息队列处理异步任务
4. 实现容器调度策略

---

### 9.4 安全相关

**Q: 如何防止容器逃逸？**

A:
1. 使用非特权容器
2. 限制容器权限（--cap-drop=ALL）
3. 使用安全计算模式（seccomp）
4. 定期更新Docker版本

**Q: 如何保护敏感信息？**

A:
1. 使用环境变量存储密钥
2. 不要在代码中硬编码密码
3. 使用HTTPS加密传输
4. 定期更换JWT密钥

**Q: 如何防止SQL注入？**

A:
1. 使用GORM的参数化查询
2. 验证用户输入
3. 使用白名单过滤
4. 定期安全审计

---

### 9.5 维护相关

**Q: 如何备份数据？**

A: 参见7.7节备份策略

**Q: 如何升级系统？**

A:
1. 备份数据库
2. 拉取最新代码
3. 执行数据库迁移
4. 重启服务
5. 验证功能

**Q: 如何监控系统状态？**

A:
1. 使用 `/monitor/resources` 接口获取资源统计
2. 配置Prometheus + Grafana
3. 使用Sentry追踪错误
4. 查看日志文件

**Q: 如何清理无用容器？**

A:
```bash
# 手动清理
go run cmd/cleanup/main.go

# 或使用Docker命令
docker container prune -f
```

---

### 9.6 开发相关

**Q: 如何调试WebSocket连接？**

A: 参见8.3.3节WebSocket调试

**Q: 如何添加新的API接口？**

A: 参见8.2.1节添加新的API接口

**Q: 如何修改数据库结构？**

A: 参见8.2.2节添加数据库迁移

**Q: 前端如何调用后端API？**

A: 使用封装好的API函数:
```typescript
import { courseAPI } from '@/lib/api';

const courses = await courseAPI.getAll();
```

---

## 10. 未来规划

### 10.1 短期计划（1-3个月）

#### 10.1.1 功能增强
- [ ] 实现实时协作功能（多人同时编辑）
- [ ] 添加代码编辑器（Monaco Editor集成）
- [ ] 支持Jupyter Notebook
- [ ] 实现容器快照和恢复
- [ ] 添加实验报告生成功能

#### 10.1.2 性能优化
- [ ] 实现Redis缓存
- [ ] 优化容器启动速度
- [ ] 实现容器池（预创建容器）
- [ ] 添加CDN支持
- [ ] 实现数据库读写分离

#### 10.1.3 用户体验
- [ ] 添加暗黑模式
- [ ] 优化移动端体验
- [ ] 添加快捷键支持
- [ ] 实现拖拽上传
- [ ] 添加进度提示动画

### 10.2 中期计划（3-6个月）

#### 10.2.1 架构升级
- [ ] 微服务架构改造
- [ ] 实现容器编排（Kubernetes）
- [ ] 添加消息队列（RabbitMQ/Kafka）
- [ ] 实现分布式追踪（Jaeger）
- [ ] 添加服务网格（Istio）

#### 10.2.2 功能扩展
- [ ] 支持多语言环境（Python, Java, C++等）
- [ ] 实现AI辅助编程
- [ ] 添加代码审查功能
- [ ] 支持团队协作
- [ ] 实现成绩分析和可视化

#### 10.2.3 安全增强
- [ ] 实现双因素认证（2FA）
- [ ] 添加审计日志
- [ ] 实现细粒度权限控制（RBAC）
- [ ] 添加安全扫描
- [ ] 实现数据加密

### 10.3 长期计划（6-12个月）

#### 10.3.1 平台化
- [ ] 开放API平台
- [ ] 实现插件系统
- [ ] 支持第三方集成
- [ ] 添加市场功能（课程市场）
- [ ] 实现多租户支持

#### 10.3.2 智能化
- [ ] AI自动判题
- [ ] 智能推荐课程
- [ ] 学习路径规划
- [ ] 智能答疑机器人
- [ ] 代码质量分析

#### 10.3.3 国际化
- [ ] 多语言支持（i18n）
- [ ] 多时区支持
- [ ] 多货币支持
- [ ] 本地化内容
- [ ] 全球CDN部署

---

## 11. 联系方式

### 11.1 项目维护者

- **Shenyi**: [联系方式]
- **XIAO RUI JIE**: [联系方式]

### 11.2 技术支持

- **GitHub**: [项目仓库地址]
- **文档**: [在线文档地址]
- **问题反馈**: [Issue地址]
- **讨论区**: [Discussion地址]

### 11.3 社区

- **QQ群**: [群号]
- **微信群**: [二维码]
- **邮件列表**: [邮箱地址]

---

## 12. 附录

### 12.1 环境变量清单

#### 后端环境变量 (server/.env)
```bash
# 服务器配置
PORT=3001                                    # 后端端口
GIN_MODE=debug                               # Gin模式: debug, release

# 数据库配置
DATABASE_URL="file:./prisma/spark_lab.db?_fk=1"  # 数据库连接字符串

# Docker配置
DOCKER_HOST="unix:///var/run/docker.sock"         # 本机 Docker Engine Unix socket

# GitHub更新配置
GITHUB_REPO="opshenyi/SparkLab"                   # GitHub仓库 owner/name
GITHUB_BRANCH="main"                              # 更新分支
UPDATE_CHECK_CACHE_SECONDS=300                    # GitHub 检查缓存秒数，避免频繁请求
UPDATE_SCRIPT_TIMEOUT_SECONDS=600                 # 更新脚本最长执行时间
GITHUB_TOKEN=""                                   # 可选：提高 GitHub API 调用额度
APP_REPO_DIR=""                                   # 可选：服务不在仓库内启动时指定仓库目录
SPARKLAB_RESTART_COMMAND=""                       # 可选：更新构建成功后的重启命令

# JWT配置
JWT_SECRET="your-super-secret-jwt-key"       # JWT密钥（生产环境必须修改）
JWT_EXPIRES_IN="7d"                          # JWT过期时间

# CORS配置
WEB_URL="http://localhost:3000"              # 前端URL（支持多个，逗号分隔）
```

#### 前端环境变量 (web/.env)
```bash
# 后端配置
SERVER_URL=http://127.0.0.1:3001             # 后端URL（服务器端使用）
NEXT_PUBLIC_BACKEND_WS_URL=10.0.0.1:3001     # WebSocket URL（浏览器端使用）
```

### 12.2 端口使用清单

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | Next.js前端 | Web界面 |
| 3001 | Go后端 | API服务 + WebSocket |
| 30000-40000 | 容器端口 | 动态分配给容器 |

### 12.3 依赖版本清单

#### 后端依赖
```
Go: 1.25.0
Gin: 1.10.0
GORM: 1.30.0
Docker SDK: 28.5.2
JWT: 5.2.1
WebSocket: 1.5.1
```

#### 前端依赖
```
Next.js: 14.1.0
React: 18.2.0
TypeScript: 5.3.3
Zustand: 4.5.0
Axios: 1.6.5
Tailwind CSS: 3.4.1
xterm.js: 5.3.0
```

### 12.4 数据库Schema版本

当前版本: `20260409120000_add_activity_logs`

迁移历史:
1. `20260401112546_init` - 初始化
2. `20260402000000_add_cpu_tracking` - CPU追踪
3. `20260407000000_add_composes` - Compose支持
4. `20260407100000_add_author_role` - 作者角色
5. `20260407100857_remove_snapshots` - 移除快照
6. `20260408000000_add_course_types` - 课程类型
7. `20260409000000_add_soft_delete` - 软删除
8. `20260409100000_change_to_active_status` - 活跃状态
9. `20260409120000_add_activity_logs` - 活动日志

### 12.5 API版本历史

| 版本 | 发布日期 | 主要变更 |
|------|----------|----------|
| v0.1.0 | 2026-03-01 | 初始版本 |
| v0.2.0 | 2026-04-01 | 添加视频和考试功能 |
| v0.2.0.3184 | 2026-04-11 | 添加活动日志 |

### 12.6 术语表

| 术语 | 说明 |
|------|------|
| Lab | 实验，包含实验内容、容器配置、判题脚本等 |
| Container | Docker容器，用于运行实验环境 |
| Enrollment | 课程注册，记录学生报名课程的信息 |
| Submission | 提交记录，记录学生提交实验的结果 |
| Server | 服务器，管理Docker容器的物理或虚拟服务器 |
| JWT | JSON Web Token，用于用户认证 |
| WebSocket | 双向通信协议，用于实时终端 |
| SSE | Server-Sent Events，用于服务器推送 |
| CORS | 跨域资源共享 |
| ORM | 对象关系映射 |

---

## 结语

SparkLab是一个功能完善的在线实验平台，具有良好的扩展性和可维护性。本文档详细记录了项目的各个方面，希望能帮助新的维护者快速上手。

如有任何问题，欢迎通过上述联系方式与我们沟通。

祝项目发展顺利！

---

**文档结束**

最后更新: 2026年4月11日  
维护者: Shenyi & XIAO RUI JIE  
版本: v1.0
