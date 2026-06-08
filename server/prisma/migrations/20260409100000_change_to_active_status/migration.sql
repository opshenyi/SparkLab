-- 重命名 courses 表的字段
-- 将 isPublished 改为 isActive（开课状态）
-- 删除 isDeleted 和 deletedAt 字段

-- 1. 添加新字段 isActive，默认值为 true（开课）
ALTER TABLE courses ADD COLUMN isActive BOOLEAN NOT NULL DEFAULT 1;

-- 2. 将 isPublished=1 的课程设置为 isActive=1（已发布的课程默认开课）
UPDATE courses SET isActive = isPublished WHERE isPublished = 1;

-- 3. 删除旧字段
ALTER TABLE courses DROP COLUMN isPublished;
ALTER TABLE courses DROP COLUMN isDeleted;
ALTER TABLE courses DROP COLUMN deletedAt;

-- 4. 删除 labs 表的软删除字段
ALTER TABLE labs DROP COLUMN isDeleted;
ALTER TABLE labs DROP COLUMN deletedAt;
