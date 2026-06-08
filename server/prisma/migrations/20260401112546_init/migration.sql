-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '未命名',
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "avatar" TEXT,
    "qqNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'beginner',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "labs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT NOT NULL DEFAULT 'beginner',
    "order" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 100,
    "timeLimit" INTEGER NOT NULL DEFAULT 60,
    "serverId" TEXT,
    "dockerImage" TEXT NOT NULL DEFAULT 'ubuntu:22.04',
    "cpuLimit" REAL NOT NULL DEFAULT 1.0,
    "memoryLimit" INTEGER NOT NULL DEFAULT 512,
    "shellCommand" TEXT NOT NULL DEFAULT '/bin/bash',
    "portMappings" TEXT,
    "environmentVars" TEXT,
    "volumeMounts" TEXT,
    "restartPolicy" TEXT NOT NULL DEFAULT 'unless-stopped',
    "judgeScript" TEXT,
    "judgeType" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "labs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "labs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "labId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "hint" TEXT,
    CONSTRAINT "steps_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "containers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "serverId" TEXT,
    "containerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "portMappings" TEXT,
    "cpuLimit" REAL NOT NULL DEFAULT 1.0,
    "memoryLimit" INTEGER NOT NULL DEFAULT 512,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "stoppedAt" DATETIME,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoStopAt" DATETIME,
    CONSTRAINT "containers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "containers_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "containers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "snapshots_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "containers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" TEXT,
    "logs" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "submissions_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 0,
    "username" TEXT NOT NULL DEFAULT '',
    "authType" TEXT NOT NULL DEFAULT 'password',
    "password" TEXT,
    "privateKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastCheckAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxContainers" INTEGER NOT NULL DEFAULT 10,
    "cpuCores" INTEGER NOT NULL DEFAULT 0,
    "cpuModel" TEXT,
    "totalMemory" INTEGER NOT NULL DEFAULT 0,
    "activeContainers" INTEGER NOT NULL DEFAULT 0,
    "cpuUsage" REAL NOT NULL DEFAULT 0.0,
    "memoryUsage" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "containers_containerId_key" ON "containers"("containerId");
