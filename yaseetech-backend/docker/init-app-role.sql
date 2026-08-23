-- Runs automatically on first container creation (docker-entrypoint-initdb.d),
-- as the POSTGRES_USER bootstrap role -- which is a SUPERUSER by default in
-- the official postgres image. That's fine for running migrations, but the
-- running application must never connect as a superuser: superusers bypass
-- Row-Level Security unconditionally, silently defeating every tenant-
-- isolation policy in this schema (see README.md, "Critical: the database
-- role you connect as MUST NOT be a superuser" -- found via real testing,
-- not theoretical).
--
-- This creates a second, restricted role for the app to actually connect
-- as, and uses ALTER DEFAULT PRIVILEGES so it automatically gets the right
-- grants on tables created LATER by migrations (which still run as the
-- superuser) -- this script runs before any migration, so the tables don't
-- exist yet at this point.

CREATE ROLE yaseetech_app WITH LOGIN PASSWORD 'yaseetech_app_dev_password' NOSUPERUSER NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO yaseetech_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO yaseetech_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO yaseetech_app;
