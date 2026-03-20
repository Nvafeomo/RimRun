#!/usr/bin/env node
/**
 * Reverse geocode courts with null name or address using OpenStreetMap Nominatim.
 * Fills in address and optionally name from coordinates.
 *
 * Usage: node scripts/geocode-courts.js
 *
 * Requires: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Rate limit: Nominatim allows 1 request/second. ~500 courts = ~8 minutes.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars. Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildAddress(result) {
  const addr = result?.address;
  if (!addr) return result?.display_name || null;
  const parts = [
    addr.road,
    addr.suburb || addr.neighbourhood || addr.village,
    addr.city || addr.town || addr.municipality,
    addr.state,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : result.display_name || null;
}

function buildName(result) {
  // Prefer park, playground, or place name for court context
  const addr = result.address || {};
  const name =
    addr.park ||
    addr.playground ||
    addr.sports_centre ||
    addr.leisure ||
    result.name;
  if (name) {
    return String(name).toLowerCase().includes('basketball')
      ? name
      : `${name} Basketball Court`;
  }
  return null;
}

async function reverseGeocode(lat, lon) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lon);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'RimRun/1.0 (basketball court app)' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const { data: allCourts, error } = await supabase
    .from('courts')
    .select('id, name, address, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) {
    console.error('Error fetching courts:', error);
    process.exit(1);
  }

  const courts = (allCourts || []).filter((c) => c.name == null || c.address == null);

  const toUpdate = courts;
  console.log(`Found ${toUpdate.length} courts needing name or address`);
  if (toUpdate.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i++) {
    const court = toUpdate[i];
    await sleep(1100); // Nominatim: 1 req/sec
    const result = await reverseGeocode(court.latitude, court.longitude);
    if (!result) {
      console.log(`  [${i + 1}/${toUpdate.length}] No result for ${court.latitude},${court.longitude}`);
      continue;
    }

    const newAddress = buildAddress(result);
    const newName = buildName(result);
    const updates = {};
    if (!court.name && newName) updates.name = newName;
    if (!court.address && newAddress) updates.address = newAddress;

    if (Object.keys(updates).length === 0) continue;

    const { error: updateError } = await supabase
      .from('courts')
      .update(updates)
      .eq('id', court.id);

    if (updateError) {
      console.error(`  Update error for ${court.id}:`, updateError.message);
    } else {
      updated++;
      console.log(`  [${i + 1}/${toUpdate.length}] ${court.id}: ${updates.name || '(name unchanged)'} | ${updates.address || '(addr unchanged)'}`);
    }
  }

  console.log(`\nDone. Updated ${updated} courts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
