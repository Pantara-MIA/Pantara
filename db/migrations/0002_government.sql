-- 0002_government: government role, agency profiles and market interventions.

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'msme';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_role_check') THEN
        ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('msme', 'government'));
    END IF;
END $$;

-- One row per government account. region_id is a regency/city ID from
-- internal/regional/region.go, or 'jabar' for province-wide authority.
CREATE TABLE IF NOT EXISTS government_profiles (
    id          uuid        PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
    agency_name text        NOT NULL,
    region_id   text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interventions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id     text        NOT NULL,
    commodity_id  text        NOT NULL,
    type          text        NOT NULL CHECK (type IN (
                      'market_operation', 'cheap_food_market', 'supply_distribution',
                      'market_inspection', 'stock_release', 'other')),
    title         text        NOT NULL,
    description   text        NOT NULL DEFAULT '',
    start_date    date        NOT NULL,
    end_date      date        NOT NULL,
    volume        numeric,
    volume_unit   text,
    budget_idr    numeric,
    status        text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    -- Forecast and alert at baseline_date, frozen when the intervention is
    -- recorded; it is the counterfactual for the impact evaluation.
    baseline_date date        NOT NULL,
    trigger       jsonb       NOT NULL,
    created_by    uuid        NOT NULL REFERENCES app_users (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    published_at  timestamptz,
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS interventions_region_idx ON interventions (region_id, status);
CREATE INDEX IF NOT EXISTS interventions_published_idx ON interventions (published_at DESC) WHERE status = 'published';
