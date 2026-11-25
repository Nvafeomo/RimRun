# Local database policy tests

Tests SQL proposals against a throwaway local Postgres (15+), using small
stand-ins for Supabase's `auth` schema and API roles (`local_stubs.sql`).
They never touch the hosted project.

```bash
# any disposable Postgres, e.g. docker run -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
export PGHOST=localhost PGUSER=postgres
supabase/tests/run_local.sh                    # with the proposal: prints ALL TESTS PASSED
supabase/tests/run_local.sh without-proposal   # stops at the first FAIL, showing what the proposal fixes
```

## 20261125_abuse_limits.sql — what to check before applying to production

1. Run `supabase/audit/security_audit.sql` in the SQL editor. In `functions`, every
   function that calls `enforce_rate_limit` or `enforce_user_rate_limit`
   (for example `send_friend_request`, `submit_content_report`) must show
   `"security_definer": true`. An invoker function calling them would start
   failing after the REVOKE; make it SECURITY DEFINER first or skip step 1.
2. Check nothing other than `accept_friend_request` inserts into `friendships`
   as a signed-in user (the app does not).
3. Note the current `storage_buckets` values so you can roll back step 5.
4. Apply in the SQL editor, then in the app: send a chat message, send and
   accept a friend request, change your profile photo, sign in with a wrong
   password once.

Rollback: `GRANT EXECUTE ON FUNCTION public.enforce_rate_limit(text, integer, integer) TO authenticated;`
(same for `enforce_user_rate_limit`), `DROP TRIGGER trg_messages_enforce_send_rate ON public.messages;`,
`ALTER TABLE public.messages DROP CONSTRAINT messages_content_max_length;`, re-create the
friendships insert policy from `scripts/friendships-migration.sql`, and reset the bucket values.
