# Life OS collaboration and UX TODO

## Pending outcomes

### Repair production Pages delivery
- [x] The public GitHub Pages site serves the built Vite application and static assets from the repository’s existing Actions artifact workflow, not the unbuilt source `index.html`.
- [x] Deep public-journal URLs return the 404 app shell with bundled assets, and the Actions deployment is verified successful.

### Make Projects status-first and phone-readable
- [ ] Planning, Active, On hold, and Done are selectable at the top; each status count remains visible; the main view shows the selected status instead of forcing all statuses into competing columns.
- [ ] Project status can be changed with a clear non-drag selector and by accessible mouse/touch drag where meaningful.
- [ ] Opening a project on a phone keeps text horizontal, readable, wrapped inside the viewport, and controls reachable without zooming or page-wide horizontal overflow.
- [ ] Project details use progressive disclosure and responsive single-column phone structure without breaking current private project data or task dependencies.

### Add secure shared projects and non-destructive portfolios
- [ ] A user can create a private project or explicitly share one; multiple accounts can work in one shared project using separate accounts.
- [ ] Roles include Lead, Admin, Member, Guest, and Viewer; multiple leaders are allowed; creation/audit attribution does not require one exclusive project owner; all members can collaborate on tasks when configured as members.
- [ ] Membership checks and role permissions are enforced in the database for every operation; hiding UI controls is never treated as authorization.
- [ ] Invitations are revocable and expire; secrets are not stored in cleartext; member email addresses are not exposed in public queries.
- [ ] Users retain their own account, personal task list, routines, and private projects; personal data is not copied into team records or exposed to teammates by default.
- [ ] Existing projects can be connected in a portfolio without duplicating project/task IDs, history, or permissions. Destructive merge/split is deferred until conflict handling and data recovery are designed.

### Connect team execution to personal work safely
- [ ] Shared tasks support assignee(s), due dates, estimates, dependency/blocker links, status, and comments/activity.
- [ ] Shared tasks assigned to the signed-in user appear in that user’s Today/task view; task changes remain in shared storage and do not overwrite the personal JSON snapshot.
- [ ] Optional links from a team task to the current user’s own goals/habits remain private to that user; routine logs and unrelated tasks are never shared automatically.
- [ ] Project work includes comments/mentions, a scoped activity feed, decisions/meeting notes, milestones, and a per-user notification inbox; only relevant people receive assignment, mention, blocker, and due-date notifications.
- [ ] Realtime subscriptions are membership-scoped and server-side writes preserve an activity history suitable for auditing.

### Improve project views, Journal, and movable content
- [ ] Project list and board can show the same underlying tasks; due-date calendar and contextual task details do not create duplicate task records.
- [ ] The Journal editor is a structured in-platform workspace with drafts/publication, search/filter, clear organization, and links to relevant projects/goals; public journal URLs and public/private visibility remain compatible.
- [ ] Mouse, touch, and keyboard drag/reorder is available on objects with a meaningful order (projects, tasks, journal entries, menu rows, and explicitly sortable cards), with dedicated handles and non-drag alternatives. Inputs and arbitrary decorative elements are not made draggable.

### Update navigation, notifications, languages, themes, and loading
- [ ] The mobile bottom navigation shows Projects instead of Today; Today remains available from the main/desktop navigation.
- [ ] On iPhone, including an installed PWA, the top menu button remains visible below the status bar, has a reliable touch target, and opens/closes the drawer by touch.
- [ ] In-app notifications highlight due, overdue, and unfinished/assigned work. Browser notifications are opt-in and only promise delivery while the app is open unless push infrastructure is separately configured.
- [ ] Add Chinese, Japanese, and Korean system-language choices and complete Arabic coverage while retaining English, Bengali, Hindi, and Spanish; language selection changes all visible app text, dates, accessibility labels, project UI, and empty/error/loading states; Arabic remains right-to-left.
- [ ] Apply semantic design tokens consistently across the whole app. Light mode uses white canvas, `#F6F7F9` app shell, `#E5E7EB` borders, `#171923` text, and `#635BFF` interaction accent, plus restrained semantic status colors; dark mode preserves accessible contrast.
- [ ] The loading animation is clearly visible and centered on desktop and mobile, smooth but non-blocking, and respects reduced-motion preferences.
- [ ] Preserve existing routes, integrations, and stored user data; do not add production mock collaboration records or expose private account records.

### Add private productivity tracking and earned rewards
- [ ] Track in-app focus sessions, completed work against due dates, and optional self-reported distraction time in the user's private account only. Clearly state that a web app cannot see iPhone system-wide Screen Time or other apps.
- [ ] Award points and badges only for recorded task/project completion and recorded focus sessions; prevent duplicate point awards for the same completion and show how points were earned.
- [ ] Allow earned points to unlock optional decorative themes, including a 50,000-point milestone; rewards do not grant privileges or affect other accounts.
- [ ] Keep focus logs and reward history out of shared project data and outside admin cross-account records.

### Protect data import/export
- [ ] Require fresh authentication using the existing account provider (password re-entry for password accounts; Google reauthentication for Google accounts); do not add or store a second app-specific password.
- [ ] Export only after successful reauthentication, and import only after reauthentication plus validation, preview, and an explicit merge-or-replace choice.
- [ ] Import writes are atomic or recoverable, preserve privacy boundaries, and never leave the user’s current data partially replaced on validation failure.


## 2026-10-25 requested refinements

### Upgrade team project identity and discussion
- [x] Team workspace displays member names from the existing RLS-protected profile source rather than showing member UUIDs; discussion uses a modern chat-bubble layout with sender attribution, timestamps, existing mentions, real-time updates, and existing seen/read receipts, without inventing unsupported reactions or attachments.

### Improve Insights, Albums, Journal, and Calendar in place
- [x] Insights adds selectable recent-activity windows, comparable-period completion counts, date-filtered mood summaries, clearer accessible chart summaries, and responsive charts while preserving sample-size qualification and using only recorded data.
- [x] Albums adds search/navigation, memory counts, responsive gallery cards, and an accessible photo lightbox while preserving private upload, compression, deletion, and storage behavior.
- [x] Journal adds entry counts, search, date/mood filters, word/character counts, and accessible mood controls while preserving drafts, explicit publish review/consent, and safe unpublishing.
- [x] Calendar & Timeline supports accessible date movement for existing dated items and horizon movement for existing life-library items, retaining month date-click creation and non-drag controls without duplicating records.

### Refine motion and mobile interaction
- [x] Existing page and system interactions use restrained responsive transitions and visible keyboard focus; motion respects reduced-motion preferences and does not restructure pages or force horizontal scrolling.

### Restore owner account directory
- [ ] The UI still reports the account-list RPC missing after the original setup; re-create `lifeos_admin_list_users(p_limit, p_offset)` with an idempotent repair migration, reload PostgREST's schema cache, then verify the RPC in the exact Supabase project used by the app. The authenticated SQL editor must be used by the owner to apply the repair.


## 2026-10-25 Trash and capacity follow-up

- [x] “Reedit this trash section with more text and details”: keep the Settings Trash summary count-only, explain how restoration and permanent deletion work, and send users to the Trash page for titles, types, dates, and actions.
- [x] “Make it can handle huge load and user load”: make the detailed Trash list searchable and paginated, and batch bulk removal so it does not issue one full account-snapshot sync per removed row; preserve photo cleanup failures in Trash for retry. This reduces Trash UI/rendering and sync bursts but does not raise hosting or database quotas.
- [x] “Give me a number that how many people can use it at once or load capacity”: report documented hosting/backend quotas separately from a tested concurrent-user benchmark; do not claim a measured user count without a safe staging load test. See `CAPACITY.md`.
- [x] Keep each Calendar & Timeline horizon-card item title fully readable beside its selector at desktop and mobile widths; the Calendar floating action creates a dated Calendar item, and Trash has no generic floating Add button covering its controls.
- [ ] For broad public-scale capacity, choose an application-oriented host/plan and verify concurrency with a separate staging load test; do not claim this is done until hosting and backend capacity are measured.


## 2026-10-25 Search discoverability and erase verification

- [ ] “Make the platform available in Google search”: publish a crawlable product-information page with unique title, description, canonical/social metadata, appropriate structured data, robots policy, sitemap entry, and links to the product and public journal; keep private account data out of the index.
- [ ] “For all types of occupation and jobs”: describe actual supported workflows for study, individual work, projects/teams, creative work, and personal planning without unsupported “best in the world,” ranking, testimonial, or feature claims.
- [ ] “In Settings to Erase all data must need password to verify”: gate the existing personal-data reset with fresh password verification for password accounts, fresh account verification for OAuth-only accounts, and a deliberate confirmation for local-only data; do not convert it into account deletion.
- [ ] Publish the sitemap and request crawling in Google Search Console only if the user’s site property is already verified or after the user completes verification; Google does not guarantee indexing or ranking.


## 2026-10-26 owner-RPC and assistant follow-up

- [ ] Repair the deployed owner account-list RPC: the frontend calls `lifeos_admin_list_users(p_limit, p_offset)`; provide an idempotent migration that re-creates the guarded function and triggers a PostgREST schema-cache reload, then verify the RPC in the correct project.
- [ ] “Find a complete free API to integrate a system as AI as chatbot anything user say to it. It you should understand make plan and create a schedule”: use the current free-tier Gemini API as an opt-in, planning/scheduling-only prototype; do not imply that free access is unlimited or private.
- [ ] “All the features service limited to schedule help and make plan only”: require an authenticated account, send no private account snapshot, provide an editable plan preview, require explicit confirmation before writing, and have the AI decline unrelated tasks.
- [ ] “Put the chatbot top of the plus button and not always visible”: mount a compact assistant launcher above the existing contextual Add button; open the conversation only when tapped and hide it on public routes.
- [ ] Keep the Gemini key server-side in Supabase Function Secrets and require the user to deploy the Edge Function and set their own key before the feature becomes active.
