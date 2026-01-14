-- Migration: Drop version_sessions table
-- Reason: Moved session state persistence from PostgreSQL to SQLite (AgentFS)
-- Date: 2026-01-14

-- Drop the version_sessions table
DROP TABLE IF EXISTS "version_sessions";
