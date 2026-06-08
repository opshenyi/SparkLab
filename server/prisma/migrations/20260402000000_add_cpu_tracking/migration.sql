-- Add CPU tracking fields for accurate CPU usage calculation
ALTER TABLE "servers" ADD COLUMN "cpuIdlePrev" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "servers" ADD COLUMN "cpuTotalPrev" INTEGER NOT NULL DEFAULT 0;
