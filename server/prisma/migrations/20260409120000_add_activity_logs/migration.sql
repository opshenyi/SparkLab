-- 创建活动日志表
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") 
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS "activity_logs_userId_createdAt_idx" 
    ON "activity_logs"("userId", "createdAt");
