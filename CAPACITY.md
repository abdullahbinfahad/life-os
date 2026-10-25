# Life OS capacity and scale note

**Checked:** 25 October 2026

## What the current limits say

The deployed frontend is served from GitHub Pages and the backend is Supabase Free. Supabase Free currently documents **50,000 monthly active users (MAU)**, **200 concurrent Peak Realtime connections**, **2 million Realtime messages per month**, **500 MB database size**, **1 GB file storage**, and **5 GB egress**. [1] The Realtime limits documentation also lists **100 messages per second** and **100 channel joins per second** on Free. [2] MAU is a monthly account quota; it is not a simultaneous-user figure.

The most useful at-once number for this app is therefore **200 concurrent Realtime connections as the plan ceiling**. If each signed-in browser session holds one connection, that is roughly 200 connected browser sessions, but it is **not a tested or guaranteed number of people**: multiple tabs/devices can use multiple connections, non-Realtime visitors use them differently, and database/egress limits or latency may be reached first. No production load test has been run, so Life OS has no verified safe concurrent-user capacity yet.

GitHub Pages has a **soft 100 GB monthly bandwidth limit** and may apply rate limits (including HTTP 429 responses); this does not define a concurrency cap. GitHub also says Pages is not intended as a free hosting service for a SaaS. [3] For a broadly public, multi-account service, plan to move the frontend to a host intended for applications before relying on Pages at scale.

## Current application behavior

Personal Life OS data is stored as a per-user `life_data` JSON snapshot and synced through Supabase; writes are debounced by about 1.2 seconds. This is simple and isolates account rows, but the whole snapshot grows with a user's records. The Trash page now searches the local snapshot and renders at most 50 records per page; bulk deletion batches the Trash state update and limits concurrent private-photo deletions. Those changes reduce UI rendering and request bursts but do not change the database schema or raise provider quotas.

A local synthetic-only 390px browser check loaded 10,000 Trash entries, rendered 50 at a time, and filtered to one match. The observed startup-to-stable-list time was about 773 ms, including a 300 ms wait, and the search interaction took about 35 ms. These are single-run local-browser timings; they do not measure server throughput or concurrent users.

## Practical guidance

Treat **200 Realtime connections as the documented ceiling, not a capacity promise**. Before advertising a higher concurrent-user number, use a separate staging Supabase project and representative synthetic data to run a gradual load test, measuring API latency, error rates, Realtime connections/messages, database size, file storage, and egress. Do not stress-test the production project or real user records. A larger audience may require a paid Supabase plan, an application-oriented frontend host, and eventually paged/normalized personal records; those infrastructure changes and costs have not been applied here.

## References

[1]: https://supabase.com/pricing "Supabase pricing and plan quotas"
[2]: https://supabase.com/docs/guides/realtime/limits "Supabase Realtime limits"
[3]: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits "GitHub Pages limits and usage policy"
