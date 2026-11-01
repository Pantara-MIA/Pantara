-- 0001_init: MSME (UMKM) accounts, business profiles and master data.
-- Mirrors the schema the Go code has always used (internal/api/auth.go,
-- internal/api/metadata.go). Idempotent so it is safe on a database that was
-- set up by hand before migrations existed.

CREATE TABLE IF NOT EXISTS app_users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text        UNIQUE NOT NULL,
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
    id               uuid        PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
    business_name    text        NOT NULL,
    fnb_category     text,
    reference_market text,
    commodities      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    storage_method   text                 DEFAULT 'ambient',
    daily_decay_rate float8               DEFAULT 0.03,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_commodities (
    id   text PRIMARY KEY,
    name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_fnb_categories (
    id   text PRIMARY KEY,
    name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_markets (
    id     text PRIMARY KEY,
    name   text NOT NULL,
    region text
);

CREATE TABLE IF NOT EXISTS master_storage_methods (
    id               text   PRIMARY KEY,
    label            text   NOT NULL,
    short_label      text   NOT NULL,
    icon             text,
    daily_decay_rate float8 NOT NULL,
    shelf_life_days  int    NOT NULL,
    description      text,
    form_label       text
);

-- Seed data (user-facing labels stay in Indonesian).
INSERT INTO master_commodities (id, name) VALUES
    ('cabai_merah_besar', 'Cabai Merah Besar'),
    ('cabai_merah_keriting', 'Cabai Merah Keriting'),
    ('cabai_rawit_hijau', 'Cabai Rawit Hijau'),
    ('cabai_rawit_merah', 'Cabai Rawit Merah')
ON CONFLICT (id) DO NOTHING;

INSERT INTO master_fnb_categories (id, name) VALUES
    ('ayam_geprek', 'Ayam Geprek'),
    ('katering', 'Katering'),
    ('restoran_padang', 'Restoran Padang'),
    ('warteg', 'Warteg')
ON CONFLICT (id) DO NOTHING;

INSERT INTO master_markets (id, name, region) VALUES
    ('pasar_induk_kramat_jati', 'Pasar Induk Kramat Jati', 'DKI Jakarta'),
    ('pasar_kebayoran_lama', 'Pasar Kebayoran Lama', 'DKI Jakarta'),
    ('pasar_mayestik', 'Pasar Mayestik', 'DKI Jakarta'),
    ('pasar_minggu', 'Pasar Minggu', 'DKI Jakarta'),
    ('pasar_pondok_labu', 'Pasar Pondok Labu', 'DKI Jakarta')
ON CONFLICT (id) DO NOTHING;

INSERT INTO master_storage_methods (id, label, short_label, icon, daily_decay_rate, shelf_life_days, description, form_label) VALUES
    ('airtight', 'Kotak Kedap Udara + Tisu Alas', 'Kedap Udara', '🥡', 0.005, 21,
     'Wadah tertutup beralas tisu penyerap embun, disimpan di dalam chiller.',
     'Kotak Kedap Udara + Tisu Alas — susut ±0,5%/hari, batas simpan hingga 21 hari'),
    ('chiller', 'Chiller / Kulkas Rumah Tangga', 'Chiller', '❄️', 0.015, 14,
     'Rak bawah kulkas 4–8 °C; memperlambat respirasi dan pertumbuhan jamur.',
     'Chiller / Kulkas Rumah Tangga — susut ±1,5–2%/hari, batas simpan 10–14 hari'),
    ('room', 'Suhu Ruang / Keranjang Terbuka', 'Suhu Ruang', '🧺', 0.03, 7,
     'Bahan ditaruh di keranjang atau kantong di sudut dapur, tanpa pendingin.',
     'Suhu Ruang / Keranjang Terbuka — susut ±3–4%/hari, batas simpan 5–7 hari')
ON CONFLICT (id) DO NOTHING;
