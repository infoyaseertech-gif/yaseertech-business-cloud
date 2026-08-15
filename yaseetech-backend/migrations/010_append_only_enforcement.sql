-- 010_append_only_enforcement.sql
-- Two backstops for Phase 0's financial integrity rules:
--   1. Posted journal entries (and their lines) can never be UPDATEd or DELETEd
--      by application code -- corrections must be new reversing entries.
--   2. Every journal entry's debits must equal its credits, checked at the
--      database level as a backstop to the application-layer check.
-- Also applies the append-only rule to inventory_movements, since that's
-- the audit trail the offline-sync conflict design (Phase 1, Section 6.3)
-- depends on being trustworthy.

CREATE OR REPLACE FUNCTION fn_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Table % is append-only. % is not permitted. Use a reversing/adjusting row instead.',
        TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_entries_append_only
    BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();

CREATE TRIGGER trg_journal_entry_lines_append_only
    BEFORE UPDATE OR DELETE ON journal_entry_lines
    FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();

CREATE TRIGGER trg_inventory_movements_append_only
    BEFORE UPDATE OR DELETE ON inventory_movements
    FOR EACH ROW
    -- Exception: resolving a flagged sync conflict legitimately updates
    -- is_conflict_flagged / conflict_resolved_at / conflict_resolved_by only.
    -- Everything else about the row (the movement itself) stays immutable.
    WHEN (
        TG_OP = 'DELETE' OR
        (OLD.quantity_delta IS DISTINCT FROM NEW.quantity_delta) OR
        (OLD.movement_type IS DISTINCT FROM NEW.movement_type) OR
        (OLD.product_id IS DISTINCT FROM NEW.product_id) OR
        (OLD.branch_id IS DISTINCT FROM NEW.branch_id)
    )
    EXECUTE FUNCTION fn_block_mutation();

-- Double-entry balance check. Deferred to end-of-transaction (INITIALLY
-- DEFERRED) because a journal entry and its lines are inserted in the same
-- transaction -- the entry exists before all its lines are written, so the
-- check can't run line-by-line mid-transaction.
CREATE OR REPLACE FUNCTION fn_check_journal_entry_balanced()
RETURNS TRIGGER AS $$
DECLARE
    v_journal_entry_id UUID;
    v_total_debits      NUMERIC(14, 2);
    v_total_credits     NUMERIC(14, 2);
BEGIN
    v_journal_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

    SELECT COALESCE(SUM(debit_ngn), 0), COALESCE(SUM(credit_ngn), 0)
    INTO v_total_debits, v_total_credits
    FROM journal_entry_lines
    WHERE journal_entry_id = v_journal_entry_id;

    IF v_total_debits IS DISTINCT FROM v_total_credits THEN
        RAISE EXCEPTION
            'Journal entry % is not balanced: debits %, credits %. Every entry must balance before commit.',
            v_journal_entry_id, v_total_debits, v_total_credits;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_journal_entry_lines_balanced
    AFTER INSERT ON journal_entry_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_check_journal_entry_balanced();

COMMENT ON FUNCTION fn_check_journal_entry_balanced IS
    'Runs once per inserted line but re-checks the SUM for the whole entry, '
    'deferred to end-of-transaction so all lines for one entry are present '
    'by the time it fires. This is the DB-level backstop for the '
    'application-layer double-entry check required by Phase 0.';
