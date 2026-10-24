-- Optional additive PostgreSQL workflow schema for a team-owned backend.
-- Not applied by this app; current runtime uses D1 and drizzle/ migrations.
CREATE TABLE IF NOT EXISTS continuity_cases (
 id UUID PRIMARY KEY, store_id INT NOT NULL REFERENCES stores(id),
 report TEXT NOT NULL, extraction JSONB, model TEXT,
 status TEXT NOT NULL CHECK(status IN ('received','linked','needs_records')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS continuity_plans (
 id UUID PRIMARY KEY, case_id UUID REFERENCES continuity_cases(id),
 fingerprint TEXT NOT NULL, scenario JSONB NOT NULL, assessments JSONB NOT NULL,
 plan JSONB NOT NULL, source TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decision_at TIMESTAMPTZ,
 decision_note TEXT, decision_actor TEXT
);
CREATE TABLE IF NOT EXISTS continuity_events (
 id UUID PRIMARY KEY, plan_id UUID REFERENCES continuity_plans(id),
 kind TEXT NOT NULL, detail JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS continuity_events_plan ON continuity_events(plan_id,created_at);
-- Additional operational tables need lot-level inventory, pack units,
-- existing reservations, supplier/facility dependency edges and status evidence.
-- This template deliberately does not claim to implement physical reservations.
