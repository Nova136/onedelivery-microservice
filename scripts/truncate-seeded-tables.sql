-- ============================================================
-- Truncate all tables populated by seeding-all-datas-cloud
-- Run order respects FK dependencies (children before parents).
-- CASCADE is included as a safety net for any additional FKs.
-- ============================================================

-- ── knowledge ───────────────────────────────────────────────
TRUNCATE TABLE knowledge.faq     RESTART IDENTITY CASCADE;
TRUNCATE TABLE knowledge.sop     RESTART IDENTITY CASCADE;

-- ── incident ────────────────────────────────────────────────
TRUNCATE TABLE incident.incidents RESTART IDENTITY CASCADE;

-- ── users ───────────────────────────────────────────────────
TRUNCATE TABLE users.chat_message RESTART IDENTITY CASCADE;
TRUNCATE TABLE users.chat_session RESTART IDENTITY CASCADE;
TRUNCATE TABLE users.sentiment    RESTART IDENTITY CASCADE;
TRUNCATE TABLE users."user"       RESTART IDENTITY CASCADE;

-- ── payment ─────────────────────────────────────────────────
TRUNCATE TABLE payment.refunds  RESTART IDENTITY CASCADE;
TRUNCATE TABLE payment.payments RESTART IDENTITY CASCADE;

-- ── order ───────────────────────────────────────────────────
TRUNCATE TABLE "order".order_items RESTART IDENTITY CASCADE;
TRUNCATE TABLE "order"."order"     RESTART IDENTITY CASCADE;

-- ── logistics ───────────────────────────────────────────────
TRUNCATE TABLE logistics.delivery_tracking RESTART IDENTITY CASCADE;
TRUNCATE TABLE logistics.deliveries        RESTART IDENTITY CASCADE;
TRUNCATE TABLE logistics.products          RESTART IDENTITY CASCADE;

-- ── audit ───────────────────────────────────────────────────
TRUNCATE TABLE audit.audit_events RESTART IDENTITY CASCADE;
