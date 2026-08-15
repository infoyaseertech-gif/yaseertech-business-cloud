-- 001_extensions.sql
-- Enables UUID generation and cryptographic helper functions.
-- gen_random_uuid() is core to PostgreSQL 13+, but pgcrypto is enabled
-- explicitly for portability and for any future hashing needs at the DB layer.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
