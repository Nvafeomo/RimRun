# RimRun Edge Functions

## delete-account

Allows authenticated users to permanently delete their own account. Uses the service role server-side to delete from `auth.users` (cascades handle related data).

### Deploy

```bash
supabase functions deploy delete-account
```

### Local development

```bash
supabase functions serve delete-account
```

The app calls `supabase.functions.invoke('delete-account')` which sends the user's session in the Authorization header. The function verifies the user and deletes them.
