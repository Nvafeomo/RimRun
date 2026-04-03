# Court Import Script

Import basketball courts from Overpass Turbo GeoJSON into Supabase.

## Database schema (Supabase)

| Script | Use when |
|--------|----------|
| `rimrun-full-database-setup.sql` | New empty project: tables, Storage bucket `Avatars`, RLS + RPCs. |
| `rimrun-consolidated-migrations.sql` | Project already has tables; apply security/RPC/trigger layer only. |
| `fix-rls-policy-drift.sql` | Production or dev DB has **duplicate or dangerous policies** (e.g. open INSERT on `courts`, anon `SELECT` on `profiles`). Safe to re-run. |
| `phase-3-blocks-grace-discovery-avatars.sql` | After consolidated + phase 2b: **user blocks**, **7-day friendship grace**, **`search_profiles_for_discovery`** (age matrix + minors-only discovery), **private Avatars** + authenticated read (app uses signed URLs). |

Run SQL files in the Supabase Dashboard → SQL Editor unless you use the Supabase CLI migration workflow.

## Setup

1. **Add unique constraint** (run once in Supabase SQL Editor):
   ```sql
   -- Copy contents of add-osm-unique.sql
   ```

2. **Add service role key** to `.env` (required for import; bypasses RLS):
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
   Find it in Supabase Dashboard → Settings → API → `service_role` (secret).  
   **Do not commit this key**—add it to `.env` only (already in `.gitignore` if you use `.env.local`).

3. **Install dependencies** (if not already):
   ```bash
   npm install
   ```

## Usage

```bash
# Import from export.geojson (uses insert; works without SQL setup)
npm run import-courts

# Import from a specific file
node scripts/import-courts.js path/to/your-courts.json

# Use upsert (run add-osm-unique.sql in Supabase first; avoids duplicates on re-run)
npm run import-courts -- --upsert
```

## GeoJSON format

Expects a GeoJSON FeatureCollection from Overpass Turbo. Each feature should have:

- `geometry.coordinates`: `[longitude, latitude]`
- `properties.hoops`: number of rims (optional)
- `properties.access`: `"private"` for private courts (optional)
- `id` or `properties["@id"]`: OSM ID (e.g. `way/123456`)

## Filtering

**Excluded (arenas/professional venues):**
- `leisure=stadium`
- `building=arena` or `building=stadium`
- `leisure=sports_hall` with `capacity`
- `leisure=ice_rink`

**Included (casual courts):** outdoor pitches, playgrounds, sports_centre, sports_hall without capacity, recreation grounds.

With `--upsert`, arenas already in the database are removed.

## Fill missing name/address (reverse geocoding)

For courts with null name or address, use **OpenStreetMap Nominatim** reverse geocoding (coordinates → human-readable place):

```bash
npm run geocode-courts
```

Test on a small batch first:

```bash
node scripts/geocode-courts.js --limit 25
```

- Fetches courts from Supabase where **name or address** is null (needs lat/lng)
- Calls Nominatim (free, no API key; use a descriptive `User-Agent` — already set in the script)
- **Rate limit:** ~1 request/second — e.g. ~5,000 courts ≈ 1.5 hours; run overnight for large backlogs
- Fills **address** from structured address fields (and postcode when available)
- Fills **name** from nearby park/playground when Nominatim returns it; otherwise a short label like `Basketball court (Neighbourhood)` or the first part of `display_name`

Requires **`SUPABASE_SERVICE_ROLE_KEY`** in `.env` so updates succeed.
