-- 添加课程类型支持
-- 支持三种类型：lab（实验）、video（视频）、exam（试卷）

-- 1. 为 Course 表添加类型字段
ALTER TABLE courses ADD COLUMN type TEXT NOT NULL DEFAULT 'lab';

-- 2. 为 Lab 表添加类型字段（兼容现有实验）
ALTER TABLE labs ADD COLUMN type TEXT NOT NULL DEFAULT 'lab';

-- 3. 为 Lab 表添加视频相关字段
ALTER TABLE labs ADD COLUMN videoUrl TEXT;
ALTER TABLE labs ADD COLUMN videoDuration INTEGER DEFAULT 0;

-- 4. 创建试卷题目表
CREATE TABLE IF NOT EXISTS "questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "labId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'single', -- single(单选), multiple(多选), judge(判断), fill(填空), essay(简答)
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "options" TEXT, -- JSON 格式存储选项 ["A. 选项1", "B. 选项2"]
    "answer" TEXT NOT NULL, -- 正确答案，JSON 格式
    "explanation" TEXT, -- 答案解析
    "points" INTEGER NOT NULL DEFAULT 10,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "questions_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. 创建学生答题记录表
CREATE TABLE IF NOT EXISTS "answers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL, -- 学生答案，JSON 格式
    "isCorrect" INTEGER NOT NULL DEFAULT 0, -- 0=错误, 1=正确
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. 创建视频观看进度表
CREATE TABLE IF NOT EXISTS "video_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "watchedDuration" INTEGER NOT NULL DEFAULT 0, -- 已观看时长（秒）
    "totalDuration" INTEGER NOT NULL DEFAULT 0, -- 总时长（秒）
    "completed" INTEGER NOT NULL DEFAULT 0, -- 0=未完成, 1=已完成
    "lastWatchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "video_progress_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. 创建唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS "video_progress_userId_labId_key" ON "video_progress"("userId", "labId");
CREATE INDEX IF NOT EXISTS "questions_labId_idx" ON "questions"("labId");
CREATE INDEX IF NOT EXISTS "answers_userId_idx" ON "answers"("userId");
CREATE INDEX IF NOT EXISTS "answers_submissionId_idx" ON "answers"("submissionId");
