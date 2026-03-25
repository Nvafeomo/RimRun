-- Prepare courts.osm_id for PostgREST upsert (import-courts.js onConflict: 'osm_id'); multiple NULLs allowed for user courts.

-- Drop the UNIQUE constraint if it already exists (re-runs). This drops the backing index too.
-- Do NOT use DROP INDEX on courts_osm_id_unique first — Postgres blocks it while the constraint exists.
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_osm_id_unique;

-- One row per OSM id; UNIQUE allows many rows where osm_id IS NULL (user-added courts).
ALTER TABLE public.courts ADD CONSTRAINT courts_osm_id_unique UNIQUE (osm_id);
