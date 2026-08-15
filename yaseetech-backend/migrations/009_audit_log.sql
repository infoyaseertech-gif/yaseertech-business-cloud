-- 009_audit_log.sql
-- Central audit log for every create/update/delete on sensitive tables, per
-- Phase 2 spec item 6, and for the audited "view as tenant" support mode
-- from Phase 0/11 (actor_type = 'support_agent' rows).

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL, -- nullable: platform-level actions (e.g. Super Admin editing subscription_plans) have no single tenant
    actor_user_id   UUID REFERENCES users(id),
    actor_type      TEXT NOT NULL DEFAULT 'user'
                     CHECK (actor_type IN ('user', 'support_agent', 'system')),
    action          TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'view_as_tenant')),
    table_name      TEXT NOT NULL,
    record_id       UUID,
    before_value    JSONB,
    after_value     JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS
    'Append-only by convention (no application code path updates or deletes rows '
    'here). Partitioning by month is planned once volume from Phase 0 projections '
    'justifies it -- see Phase 2 deliverable doc, Section on partitioning.';

-- Generic trigger function: attach to any sensitive table to auto-log
-- create/update/delete with before/after JSONB snapshots. Application code
-- still sets audit_logs.actor_user_id via a session variable (see below),
-- since the trigger itself has no notion of "who is making this HTTP request."
CREATE OR REPLACE FUNCTION fn_audit_log_row()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_user_id UUID;
    v_actor_type    TEXT;
BEGIN
    -- Set once per request by the app server, alongside app.current_tenant_id.
    -- Falls back to 'system' if unset (e.g. a migration or seed script run).
    BEGIN
        v_actor_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN others THEN
        v_actor_user_id := NULL;
    END;
    v_actor_type := COALESCE(NULLIF(current_setting('app.current_actor_type', true), ''), 'system');

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (tenant_id, actor_user_id, actor_type, action, table_name, record_id, after_value)
        VALUES (NEW.tenant_id, v_actor_user_id, v_actor_type, 'create', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (tenant_id, actor_user_id, actor_type, action, table_name, record_id, before_value, after_value)
        VALUES (NEW.tenant_id, v_actor_user_id, v_actor_type, 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (tenant_id, actor_user_id, actor_type, action, table_name, record_id, before_value)
        VALUES (OLD.tenant_id, v_actor_user_id, v_actor_type, 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attached to the tables Phase 2 explicitly calls out as sensitive:
-- users, payments, journal entries, inventory adjustments.
CREATE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log_row();

CREATE TRIGGER trg_audit_inventory_movements
    AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log_row();

CREATE TRIGGER trg_audit_journal_entries
    AFTER INSERT OR UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log_row();

-- payments table is created in 011_billing.sql (after this file), so its
-- audit trigger is attached there instead, right after the table exists.
