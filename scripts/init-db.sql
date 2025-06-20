-- Initialize BahinLink Database
-- This script sets up the initial database configuration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create additional schemas if needed
-- CREATE SCHEMA IF NOT EXISTS audit;
-- CREATE SCHEMA IF NOT EXISTS analytics;

-- Set timezone
SET timezone = 'UTC';

-- Create custom types (these will be handled by Prisma migrations)
-- But we can set up any additional database-level configurations here

-- Performance optimizations
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Logging configuration
ALTER SYSTEM SET log_destination = 'stderr';
ALTER SYSTEM SET logging_collector = on;
ALTER SYSTEM SET log_directory = 'pg_log';
ALTER SYSTEM SET log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log';
ALTER SYSTEM SET log_statement = 'mod';
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Connection settings
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';

-- Security settings
ALTER SYSTEM SET ssl = off; -- Enable in production
ALTER SYSTEM SET password_encryption = 'scram-sha-256';

-- Reload configuration
SELECT pg_reload_conf();

-- Grant necessary permissions to the application user
GRANT USAGE ON SCHEMA public TO bahinlink_user;
GRANT CREATE ON SCHEMA public TO bahinlink_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bahinlink_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bahinlink_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO bahinlink_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bahinlink_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bahinlink_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO bahinlink_user;

-- Create a read-only user for reporting (optional)
-- CREATE USER bahinlink_readonly WITH PASSWORD 'readonly_password';
-- GRANT CONNECT ON DATABASE bahinlink TO bahinlink_readonly;
-- GRANT USAGE ON SCHEMA public TO bahinlink_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO bahinlink_readonly;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bahinlink_readonly;
