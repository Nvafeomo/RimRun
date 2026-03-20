-- Run this in Supabase SQL Editor before using upsert in import-courts.js
-- Adds unique constraint on osm_id so upsert can use onConflict: 'osm_id'
-- Note: UNIQUE allows multiple NULLs (for user-added courts without osm_id)

-- Drop if exists (in case you need to re-run)
DROP INDEX IF EXISTS courts_osm_id_unique;
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_osm_id_unique;

-- Add unique constraint (required for ON CONFLICT; multiple NULLs allowed)
ALTER TABLE public.courts ADD CONSTRAINT courts_osm_id_unique UNIQUE (osm_id);
