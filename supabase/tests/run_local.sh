#!/usr/bin/env bash
# Usage: supabase/tests/run_local.sh [without-proposal]
# Needs psql access to a throwaway local Postgres (PGHOST/PGPORT/PGUSER as usual).
# Creates and drops a database called rimrun_policy_test.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=rimrun_policy_test
dropdb --if-exists "$DB" && createdb "$DB"
P="psql -X -q -v ON_ERROR_STOP=1 -d $DB"
$P -f supabase/tests/local_stubs.sql
$P -f supabase/migrations/20260627_rate_limiting.sql
$P -f supabase/migrations/20260628_security_hardening.sql
$P -f supabase/migrations/20260812_privilege_and_ban_enforcement.sql
$P -f scripts/friendships-migration.sql
if [ "${1:-}" != "without-proposal" ]; then
  $P -f supabase/migrations/20261125_abuse_limits.sql
fi
$P -f supabase/tests/abuse_limits_test.sql
