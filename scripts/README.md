# Court Import Script

Import basketball courts from Overpass Turbo GeoJSON into Supabase.

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

For courts with null name or address, use Nominatim reverse geocoding:

```bash
npm run geocode-courts
```

- Fetches courts from Supabase where name or address is null
- Calls OpenStreetMap Nominatim (free, no API key)
- Rate limit: 1 req/sec (~8 min per 500 courts)
- Updates address from coordinates; optionally derives name from nearby park/place
