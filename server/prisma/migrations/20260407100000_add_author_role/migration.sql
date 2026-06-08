-- Add AUTHOR role support
-- This migration adds the AUTHOR role to the system
-- AUTHOR role has the same permissions as ADMIN
-- Only users with displayName "肖瑞杰" can be assigned the AUTHOR role

-- No schema changes needed as role is stored as TEXT in SQLite
-- The AUTHOR role validation is handled at the application level
