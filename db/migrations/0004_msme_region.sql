-- 0004_msme_region: MSME tools run on the regional price data, so a business
-- profile records its regency/city (internal/regional region ID), and every
-- monitored commodity can be picked, not only the four chilies.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region_id text;

INSERT INTO master_commodities (id, name) VALUES
    ('cabai_hijau_besar', 'Cabai Hijau Besar'),
    ('beras_premium', 'Beras Premium'),
    ('beras_medium', 'Beras Medium'),
    ('beras_sphp', 'Beras Stabilisasi (SPHP)'),
    ('beras_ketan_putih', 'Beras Ketan Putih'),
    ('minyak_goreng', 'Minyak Goreng Kemasan Sederhana'),
    ('gula_pasir', 'Gula Pasir Lokal'),
    ('bawang_merah', 'Bawang Merah'),
    ('bawang_putih', 'Bawang Putih'),
    ('bawang_bombay', 'Bawang Bombay'),
    ('daging_ayam_ras', 'Daging Ayam Ras'),
    ('telur_ayam_ras', 'Telur Ayam Ras'),
    ('daging_sapi', 'Daging Sapi Paha Belakang'),
    ('tomat', 'Tomat Merah'),
    ('kentang', 'Kentang'),
    ('wortel', 'Wortel'),
    ('sawi_hijau', 'Sawi Hijau')
ON CONFLICT (id) DO NOTHING;
