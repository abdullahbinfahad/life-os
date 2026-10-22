# Life Circle

**Your life, organized — goals, plans, journals, habits and memories in one calm workspace.**

Live app: https://abdullahbinfahad.github.io/life-os/

## What is included

- Google, email/password and phone/password sign-in through Supabase Auth.
- Row-level security isolates regular account reads and writes. A verified system owner can also inspect and edit other users' Life Circle snapshots through audited admin operations; users are shown an access notice before signing in or creating an account.
- Local-first mode when Supabase variables are not configured.
- 1,000+ life ideas and an expanded 100+ area taxonomy.
- Goals, projects, dependency-aware tasks, habits, insights, calendar/timeline and Today planning.
- Journal entries with tags, mood, location, cover-image fields and private/public visibility.
- Public journal reader route: `#/public/journal/<slug>` when a row is published in `public_journals`.
- Memory albums with compressed, private photo uploads and a visual memory-tree foundation.
- Profile fields plus a direct profile-photo upload, compressed locally and stored privately.
- Recoverable Trash for deleted items, goals, projects/tasks, habits, journal entries, albums and memories.
- JSON/CSV backup and restore.
- Responsive mobile interface, animated runner logo, and installable web-app/iOS home-screen icons.
- Five interface languages (English, Bengali, Hindi, Arabic, Spanish), with right-to-left layout for Arabic and optional soft interaction sounds.

## Security and credentials

Never put OpenAI secret keys, Google client secrets, or Supabase service-role keys in this repository or browser code. The browser may use only a Supabase **anon** key. Regular account queries are protected by the RLS policies in `supabase/schema.sql`; owner access uses database-verified functions, not a client-side email check or service-role key.

The verified owner console can list account metadata, read and edit account Life OS snapshots, and view private Life OS media through short-lived signed URLs. These accesses are audit-logged. It does not expose passwords, session tokens, or auth secrets, and it does not delete or modify Supabase Auth accounts. Users must acknowledge the owner-access notice before signing in or registering. Do not store passwords, payment details, government-ID numbers, or other secrets in Life OS.

The Supabase schema must be run once in the Supabase SQL editor. Configure these GitHub Actions repository variables for cloud sign-in and sync:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Configure Google OAuth inside Supabase Auth → Providers using the OAuth client created in Google Cloud. Add these callback URLs in both systems:

- `https://abdullahbinfahad.github.io/life-os/`
- your local development URL

The canonical live URL is `https://abdullahbinfahad.github.io/life-os/`. The former `records.abdullahbinfahad.info` address is not configured as a GitHub Pages custom domain; if that domain is deleted or expired, this repository cannot restore it or create a DNS redirect. Restore control of the domain and its DNS to redirect it, or use the GitHub Pages URL directly.

## Local development

```bash
npm install
npm run dev
npm run build
```

## Supabase setup

1. Create or open the Supabase project.
2. Run `supabase/schema.sql` (safe to re-run; it creates the private media bucket and owner-only storage policies as well as the app tables).
3. For an existing installation that already ran the main schema, run `supabase/migrations/20261021_public_journal_comments.sql` if it has not already been applied. It adds public journal comments and the database-verified owner metrics function without changing existing account rows.
4. Run `supabase/migrations/20261021_owner_admin_tools.sql` to install the audited owner account directory, selected-account workspace viewer/editor, private-media read policy, and global navigation configuration. It depends on `lifeos_is_owner_admin()` from the comments migration (or the matching current `schema.sql`). The migration never changes user snapshots by itself.
5. Confirm Google and email providers are enabled in Auth settings. Phone/password sign-up also requires enabling Phone and configuring an SMS provider; the app sends an SMS verification code when a phone account is created.
6. Add the public URL to the Auth redirect allow-list.
7. Add the two `VITE_SUPABASE_*` values to GitHub Actions variables.

If the app shows `Cloud storage is not installed yet`, open the Supabase SQL Editor for the same project and run `supabase/schema.sql`. This creates the private per-user data table, public journal table, private media bucket and row-level security policies. Do not disable RLS or use a service-role key in the browser. Keep the user-facing owner-access notice in place whenever the admin migration is active.

## AI integration

AI should be connected through a server-side Supabase Edge Function or another protected backend. Do not call OpenAI directly from this static client with a secret key. The UI can safely expose prompts and results only through an authenticated server function with rate limits and usage controls.
