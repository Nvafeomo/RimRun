#!/usr/bin/env node
/**
 * Import basketball courts from Overpass Turbo GeoJSON into Supabase.
 *
 * Usage:
 *   node scripts/import-courts.js [path/to/courts.json]
 *
 * Requires:
 *   - EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *   - Run scripts/add-osm-unique.sql first if using upsert (onConflict)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env from project root
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv optional; use process.env
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing env vars. Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY) in .env'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Exclude arenas, stadiums, and non-casual venues.
 * Keep: outdoor pitches, playgrounds, sports_centre, sports_hall (without capacity).
 */
function isArena(props) {
  if (!props) return false;
  // Professional/event stadiums and arenas
  if (props.leisure === 'stadium') return true;
  if (props.building === 'arena') return true;
  if (props.building === 'stadium') return true;
  // Large sports halls with capacity (event venues, not casual gyms)
  if (props.leisure === 'sports_hall' && props.capacity) return true;
  // Ice rinks - not basketball courts
  if (props.leisure === 'ice_rink') return true;
  return false;
}

function parseIsPrivate(access) {
  if (!access) return false;
  const privateValues = ['private', 'no', 'customers'];
  return privateValues.includes(String(access).toLowerCase());
}

function parseHoops(hoops) {
  if (hoops == null) return null;
  const n = parseInt(String(hoops), 10);
  return isNaN(n) ? null : Math.min(10, Math.max(0, n));
}

function getOsmType(id) {
  if (!id) return null;
  const match = String(id).match(/^(node|way|relation)\//);
  return match ? match[1] : null;
}

function geojsonToCourt(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const [lng, lat] = coords;
  const osmId = feature.id ?? p['@id'];
  if (!osmId) return null;

  return {
    osm_id: String(osmId),
    osm_type: getOsmType(osmId),
    name: p.name || null,
    address: [p['addr:street'], p['addr:city'], p['addr:state']]
      .filter(Boolean)
      .join(', ') || null,
    latitude: lat,
    longitude: lng,
    hoops: parseHoops(p.hoops ?? p.courts),
    is_private: parseIsPrivate(p.access),
    source: 'osm',
    confidence: 1.0,
  };
}

async function importCourts(geojsonPath) {
  const resolved = path.resolve(geojsonPath);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  const features = data.features || [];
  const courts = [];
  const arenaOsmIds = [];
  for (const f of features) {
    const osmId = f.id ?? f.properties?.['@id'];
    if (isArena(f.properties)) {
      if (osmId) arenaOsmIds.push(String(osmId));
      continue;
    }
    const court = geojsonToCourt(f);
    if (court) courts.push(court);
  }

  // When upserting, remove arenas from DB so they don't persist
  if (useUpsert && arenaOsmIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('courts')
      .delete()
      .in('osm_id', arenaOsmIds);
    if (deleteError) {
      console.error('Warning: could not remove arenas:', deleteError.message);
    } else {
      console.log(`Removed ${arenaOsmIds.length} arena(s) from database`);
    }
  }

  console.log(
    `Importing ${courts.length} courts (filtered from ${features.length} features)${useUpsert ? ' [upsert mode]' : ''}...`
  );
  if (courts.length === 0) {
    console.log('No courts to import.');
    return;
  }

  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < courts.length; i += BATCH_SIZE) {
    const batch = courts.slice(i, i + BATCH_SIZE);
    const { error } = useUpsert
      ? await supabase.from('courts').upsert(batch, {
          onConflict: 'osm_id',
          ignoreDuplicates: false,
        })
      : await supabase.from('courts').insert(batch);

    if (error) {
      console.error('Batch error:', error.message);
      if (error.code === '42710' || error.message?.includes('ON CONFLICT')) {
        console.error(
          '\nTip: Run add-osm-unique.sql in Supabase, then use: npm run import-courts -- --upsert'
        );
      }
      if (error.message?.includes('row-level security')) {
        console.error(
          '\nTip: Add SUPABASE_SERVICE_ROLE_KEY to .env (Supabase Dashboard → Settings → API). The service role bypasses RLS.'
        );
      }
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${courts.length}`);
    }
  }

  console.log(`Done. Inserted: ${inserted}, Errors: ${errors}`);
}

const args = process.argv.slice(2);
const useUpsert = args.includes('--upsert');
const geojsonPath = args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'export.geojson');
importCourts(geojsonPath).catch((err) => {
  console.error(err);
  process.exit(1);
});
