-- 0003_jurisdiction_scopes: province-wide accounts now use the scope ID of the
-- province ('jawa-barat') instead of 'jabar'; 'indonesia' is national.

UPDATE government_profiles SET region_id = 'jawa-barat' WHERE region_id = 'jabar';
