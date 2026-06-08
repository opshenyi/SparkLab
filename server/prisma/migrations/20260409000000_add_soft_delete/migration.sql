-- AlterTable: 添加软删除字段到 courses 表
ALTER TABLE courses ADD COLUMN isDeleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN deletedAt DATETIME;

-- AlterTable: 添加软删除字段到 labs 表
ALTER TABLE labs ADD COLUMN isDeleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE labs ADD COLUMN deletedAt DATETIME;
