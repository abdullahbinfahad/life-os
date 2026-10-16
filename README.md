# Life Circle

**Your life, organized — goals, plans, journals, habits and memories in one calm workspace.**

Live app: https://abdullahbinfahad.github.io/life-os/

## What is included

- Google, email/password and phone/password sign-in through Supabase Auth.
- Row-level security: each signed-in account can read and write only its own private Life Circle data.
- Local-first mode when Supabase variables are not configured.
- 1,000+ life ideas and an expanded 100+ area taxonomy.
- Goals, projects, dependency-aware tasks, habits, insights, calendar/timeline and Today planning.
- Journal entries with tags, mood, location, cover-image fields and private/public visibility.
- Public journal reader route: `#/public/journal/<slug>` when a row is published in `public_journals`.
- Memory albums with a visual memory-tree foundation.
- Profile fields: name, photo URL, birthday, location and bio.
- JSON/CSV backup and restore.
- Mobile-friendly frosted/liquid-glass interface with the full-person emoji logo.

## Security and credentials

Never put OpenAI secret keys, Google client secrets, or Supabase service-role keys in this repository or browser code. The browser may use only a Supabase **anon** key, protected by the RLS policies in `supabase/schema.sql`.

The Supabase schema must be run once in the Supabase SQL editor. Configure these GitHub Actions repository variables for cloud sign-in and sync:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Configure Google OAuth inside Supabase Auth → Providers using the OAuth client created in Google Cloud. Add these callback URLs in both systems:

- `https://abdullahbinfahad.github.io/life-os/`
- your local development URL

For `records.abdullahbinfahad.info`, keep the GitHub Pages URL as the canonical main URL and configure the subdomain as a DNS/HTTP redirect to it. A single GitHub Pages project cannot serve two independent custom domains simultaneously.

## Local development

```bash
npm install
npm run dev
npm run build
```

## Supabase setup

1. Create or open the Supabase project.
2. Run `supabase/schema.sql`.
3. Enable Google, email and phone providers in Auth settings.
4. Add the public URL to the Auth redirect allow-list.
5. Add the two `VITE_SUPABASE_*` values to GitHub Actions variables.

## AI integration

AI should be connected through a server-side Supabase Edge Function or another protected backend. Do not call OpenAI directly from this static client with a secret key. The UI can safely expose prompts and results only through an authenticated server function with rate limits and usage controls.
