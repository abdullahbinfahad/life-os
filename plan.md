# Life OS Projects and Collaboration Plan

**Status:** approved; implementation in progress. Shared projects are the current priority. The existing app currently has a local Zustand project model and stores each account's data in the private `life_data` JSON snapshot. Shared work must use a separate relational model; it must not make private personal records visible to teammates.

## Product approach

Deliver the collaboration foundation before attempting the full roadmap. Start with shared projects and portfolios, membership and invitations, team tasks, comments/activity, and a personal assigned-work view. Keep `created_by` as audit metadata only, not a required single owner. Membership roles support multiple leads and can be all-member working teams. Use a portfolio to connect existing projects without duplicating IDs, task history, or permissions; defer destructive merge/split operations until conflict handling and recovery are designed.

### Core behavior

- The Projects page has a status selector at the top (Planning, Active, On hold, Done); it shows the selected status as the main page view instead of four columns competing for screen space. Counts remain visible, and status can be changed from the selector or by dragging a project card.
- The project detail becomes a responsive, readable workspace: summary, tasks, dates, members/roles, activity and comments, documents/meeting notes, decisions, and related goals. On phones, content uses shrinkable single-column layouts, safe word wrapping, full-width touch targets, and no forced text orientation or horizontal page overflow.
- Users can create a private project or explicitly make it shared. Multiple lead/admin members are allowed. Roles are Lead, Admin, Member, Guest, and Viewer; the database enforces every read and write. A project creator is not a special sole owner.
- Shared-task assignments appear in each assignee's personal Today/task view. Each user's optional links from a shared task to that user's own life goal/habit remain private and are not revealed to teammates. Personal habit logs and unrelated tasks never become project data automatically.
- Secure invite links are high-entropy, hashed at rest, expiring, revocable, and scoped to a role. Do not expose member email addresses through public queries. Avoid lookup by username/email until privacy and abuse controls exist.
- Team work includes due dates, estimates, dependencies/blockers, comments, @mentions, decisions/meeting notes, and a per-user notification inbox. Realtime updates are scoped to authorized project members. A change/activity record is written by the backend.
- First release supports project/portfolio list, task list/Kanban, and due-date calendar. Keep timeline/workload views as later extensions over the same task records, rather than separate copies of work.
- Notifications begin with in-app alerts and optional browser notifications while Life OS is open. True delivery while the browser is closed requires push credentials/background infrastructure and is not promised without an approved provider/setup.

## Existing application integration

- Keep private goals, projects, routines, journal entries, settings, and snapshots backward-compatible. Add shared-project queries through a new `src/lib/projects/*` data layer rather than moving the user's JSON data into team tables.
- Reuse the current Supabase Auth client and add additive SQL migration files under `supabase/migrations/`. RLS policies must check current membership and role for each operation; invitations use server-side RPCs, and invite secrets are never stored in cleartext.
- Add a small personal-task link table keyed to `auth.uid()` for optional private links from team tasks to personal goals/habits; never return those links to other members.
- Add scoped notification/activity APIs and subscriptions; do not subscribe to or expose another account's `life_data` rows.
- Preserve public journal routes. Redesign the signed-in Journal workspace in place, with drafts/publication, search, filters, and links to goals/projects; public journal content remains separate and explicitly published.
- Replace Today with Projects in the mobile bottom bar while retaining Today in the main/desktop navigation.
- Add Chinese, Japanese, and Korean dictionaries and complete Arabic coverage, retaining English, Bengali, Hindi, and Spanish. Apply language consistently to shared projects, dates, controls, accessible labels, empty/loading/error states, and direction (Arabic RTL).
- Establish semantic color tokens for both themes. Light theme uses white canvas, #F6F7F9 shell, #E5E7EB borders, #171923 text, #635BFF primary accent, and restrained semantic status colors. Apply the same spacing, typography, radius, border, and focus tokens across the whole application without changing content hierarchy solely for decoration.
- Center the loader and make the orbit/ring visually distinct at phone and desktop sizes; preserve a reduced-motion path and never block work for decorative animation.
- Support mouse, touch, and keyboard drag/reorder for content that has a meaningful order (projects, tasks, journal entries, menu rows, and other explicitly sortable cards); use dedicated drag handles, long-press touch activation, and visible non-drag alternatives. Do not make form controls or every arbitrary element draggable.

## Proposed project structure

- `src/pages/Projects.tsx`: status-selected project/portfolio overview and accessible drag/move interactions.
- `src/components/projects/`: project detail workspace, member/role panel, invite flow, task list/Kanban, activity/decision feed, and empty/error states.
- `src/lib/projects/`: typed Supabase queries/mutations, role-aware actions, invite parsing, and realtime subscriptions; never mix these with the private Zustand JSON store.
- `src/lib/notifications.ts`: per-user notification read state and browser-notification opt-in.
- `src/lib/locales/`: expanded locale dictionaries, preserving current lazy-loading behavior.
- `src/index.css`: semantic light/dark tokens and narrowly scoped responsive utilities; avoid global overflow hiding.
- `supabase/migrations/`: additive shared-project, membership, invitation, task, activity/comment/decision, personal-link, and notification tables, constraints, indexes, RLS, RPCs, and authorized realtime publication.
- `TODO.md`: outcome-based implementation items, created/updated after this plan is approved.

## Design direction

**Movement:** Calm, information-first productivity UI, combining the supplied restrained Notion/Linear/Apple-inspired direction without copying their branded layouts.

**Core principles:** Clear hierarchy; compact but readable work surfaces; progressive disclosure; privacy-preserving collaboration.

**Color philosophy:** Neutral, paper-like light surfaces and ink text; Indigo `#635BFF` for primary interaction; semantic status colors used consistently and sparingly. Dark mode receives equivalent contrast tokens rather than inverted hard-coded colors.

**Layout paradigm:** A single selected project-status view with a compact top filter rail, followed by a responsive project list/board and contextual detail panel. Phone layouts collapse to one readable column.

**Signature elements:** A restrained status stripe and compact project metadata row; consistent drag handles only on sortable objects; quiet empty states with one useful next action.

**Interaction and motion:** Predictable, fast transitions; touch/keyboard-accessible drag; no animation that delays action; clear focus rings; reduced-motion support.

**Typography:** Existing system font stack with Inter where already available; page titles 26–30px, section titles 16–20px, body 14–15px, secondary 12–13px with accessible contrast.

**Brand essence:** A personal life planner that can become a privacy-aware shared team workspace — clear, dependable, adaptable.

**Brand voice:** Direct and encouraging. Examples: “Choose the work view that fits today.” “Shared work stays shared; personal routines stay yours.”

**Wordmark and signature color:** Preserve the existing runner logo and brand identity. Use the restrained Indigo `#635BFF` as the shared-work accent.

## Dependencies and material constraints

- Existing frontend: React, TypeScript, Vite, React Router, Zustand, Supabase Auth/Database/Realtime, GitHub Pages.
- Drag interactions require a touch- and keyboard-capable sortable primitive; use `@dnd-kit` only for sortable content surfaces, not every control.
- SQL migration is required before collaboration works across accounts. The app can ship a safe disabled/upgrade state until the migration is applied; never simulate cross-account sharing with localStorage or unprotected client writes.
- Database tests or local Supabase are required for RLS; do not test writes against production accounts or private records.
- Existing Pages deployment configuration was found to use legacy branch publishing despite the repository's Actions artifact workflow. The public site may remain blank until the Pages source is switched to GitHub Actions; the available GitHub API token lacks permission. A browser setting change or owner action is needed to correct this before the new code can be confirmed live.

## Delivery boundaries

The first approved implementation should deliver the project-page/mobile fixes, mobile Projects navigation, core shared project and task permissions/invitations, personal assigned-work linkage, activity/comments/decision foundation, semantic theme tokens, requested locale additions, and a usable Journal workspace. Advanced AI summaries, push delivery while closed, workload recommendations, arbitrary workflow automation, destructive merge/split, and broad app-wide drag-anything behavior remain later phases unless separately scoped.

## Newly approved: focus, rewards, and protected backups

- Keep the iPhone-installed PWA header/menu button visible, within the safe area, and large enough to tap reliably; verify that the drawer opens and closes by touch.
- Build a private-by-default productivity tracker using in-app focus sessions, task completion versus due dates, and optional self-reported distractions. A web page cannot read iPhone system-wide Screen Time or monitor other apps, so never imply that it does.
- Use a transparent, idempotent rewards ledger for completed tasks/projects and completed focus sessions, with clear earned badges and optional decorative theme unlocks (including a 50,000-point theme). Rewards never grant data access or modify other users’ work.
- Protect JSON import/export with fresh Supabase authentication through the account’s existing provider (password re-entry or Google reauthentication), then show validation/preview and an explicit merge-versus-replace choice before any import write. Do not create or store an additional app-specific password.
- Keep focus logs/rewards in the user's private account data and ensure neither teams nor administrators see them through shared-project tables or cross-account views.


## Newly requested: planning-only AI assistant (2026-10-26)

- Keep the assistant scoped to planning and schedule suggestions; it must decline unrelated questions and have no general-purpose tools or autonomous account access.
- Add a compact launcher above the existing floating Add button. Keep only the launcher visible; open the chat panel on demand, and hide it on public routes.
- Call a signed-in-only Supabase Edge Function. Keep the Gemini API key in Supabase Function Secrets, never in browser code or Git. Send only the current ephemeral planning conversation, timezone, language, and current date; never inject account snapshots, journals, contacts, or history from other parts of Life OS.
- The Free Gemini tier has a data-use tradeoff. Before the first request, disclose that prompts may be used to improve Google services and may be reviewed; ask the user to acknowledge this and warn against entering sensitive, confidential, or identifying information.
- Return schema-constrained proposals, validate them server-side, let the user edit/select them, and write them to the signed-in personal store only after explicit confirmation. Do not persist chat history.
- Add a per-account daily request guard and handle unconfigured-key, quota, network, and invalid-response states without claiming an unlimited free API.
- Require fresh provider/account verification before the existing personal-data reset; do not turn that action into account deletion or silently expand its scope.


## 2026-10-29: Targeted regression fixes

Keep this repair additive and narrow. On Today, mobile task titles must stay on one readable line with secondary metadata/actions moved below at phone widths; desktop presentation remains unchanged. In Habits, hide the visible six-dot grip, allow accessible press-and-hold drag from the card surface, and make titles slightly larger without blocking normal scrolling or controls. The planning assistant uses Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`); improve typed routing/review so an explicit habit request creates a Habit with a clear recurrence and rationale, while preserving explicit confirmation and not sending private account records. Recheck the owner-list RPC in the exact app Supabase project and repair its owner-only function/schema cache if missing. Improve static shell caching only where it avoids stale or blank startup; do not cache authenticated API/user data or introduce global work that slows page interaction.


## Desktop and Android distribution handover (2026-10-29)

Keep the current React/Vite website as the single product UI and backend client; do not fork feature logic or redesign screens for wrappers. Desktop will use a hardened Electron shell loading the existing production Life Circle HTTPS origin, preserving the site's auth origin, local data, service worker, and responsive design. Android will use a Bubblewrap/Trusted Web Activity (TWA) built from the existing PWA manifest, so Chrome renders the same website origin and retains the current OAuth/PWA behavior. The APK will require a persistent Android signing key stored only as a repository Actions secret for upgrades. Full-screen TWA verification additionally requires Digital Asset Links at `https://abdullahbinfahad.github.io/.well-known/assetlinks.json`; the existing repository is published at the `/life-os/` subpath and cannot host that root-origin file itself, so without a root user-site repository or custom domain the Android app can fall back to a Chrome Custom Tab with browser chrome.

Create isolated packaging projects under `desktop/` and `android/`, plus a tag-triggered GitHub Actions release workflow. Desktop builds target Windows, macOS and Linux; unsigned installers can be distributed but Windows SmartScreen/macOS Gatekeeper may warn or block launch until platform signing certificates are supplied. Android release builds must use one stable signing identity; never commit the keystore or passwords. Publish installers and signed APK as public GitHub Release assets, not transient build files in the source tree. The downloadable wrapper must be labeled as an online client of the hosted Life Circle service; app data, auth and server migrations remain shared with the website, and native OS background/push capabilities are not claimed unless separately implemented and verified.


## New product area: Study Studio — 2026-10-30

**Product identity:** Study Studio is a first-class Life OS learning workspace, not a separate app or a timer page. Its through-line is **plan → focus → capture → practice → review → understand progress**. Keep the existing Life OS routes, authentication, navigation, themes, local-first store, Supabase client, and GitHub Pages base path intact. Add `/study` and internal Study Studio sections for Overview, Focus Room, My Subjects, Notebooks, Practice & Recall, Revision Planner, Study Analytics, and Study Settings. Do not show inactive tabs as if they work.

### Study Studio design

**Movement:** A quiet contemporary study atelier—editorial typography and paper-like working surfaces paired with a precise instrument-panel timer. It is distinct from a generic SaaS dashboard and avoids copying any named product.

**Core principles:** Keep the student oriented to one next study action; connect every session and notebook to its subject/topic; make time and learning evidence transparent; keep writing and drawing more important than decoration.

**Color philosophy:** Follow the supplied dark-first palette in dark mode: canvas `#0B0F14`, surface `#151B23`, raised surface `#1C2530`, text `#E6EDF3`, muted `#8B98A5`, action indigo `#6C8CFF`, focus cyan `#22D3EE`, break mint `#34D399`, and danger `#F87171`. In light mode use warm paper/canvas and ink text while retaining the same restrained indigo/cyan/mint semantic roles. Contrast and meaning must not rely on color alone. Continue honoring the global theme selection.

**Layout paradigm:** Desktop uses a compact Study Studio rail and a wide subject-aware work surface with one contextual side panel; the content width is allowed to grow without stretching text. Phones collapse to one column with a horizontally scrollable section rail, compact sticky session controls, and safe-area-aware spacing. No fixed-width editor or timer may force page-level horizontal scrolling.

**Signature elements:** The Focus Orb is a crisp, keyboard-operable SVG progress ring for the one canonical timer; a restrained dotted “study paper” texture appears only inside work surfaces; subject colors appear as thin identity marks rather than large gradients.

**Interaction and motion:** Controls remain immediate. Use short opacity/translate transitions around 120–220 ms and a restrained 300–400 ms spring only for opening the Focus Orb. Do not tick the app-wide store every second; derive elapsed time from persisted timestamps and refresh only the timer display. Respect `prefers-reduced-motion`; omit particles and continuous ambient motion.

**Typography:** Reuse the system/Inter stack. Use tabular numerals for the timer, 26–30 px page titles, 16–20 px section titles, 14–16 px body copy, and comfortable line lengths for notebook text.

**Brand essence:** A calm, precise learning studio for turning study intentions into focused work and useful recall; thoughtful, capable, steady.

**Brand voice:** Clear and non-judgmental. Examples: “Choose one topic. We’ll keep the rest out of your way.” “Time shows effort; recall shows what stayed.”

**Wordmark and signature color:** Keep the existing Life OS runner mark and name; pair them with a compact Study Studio wordmark and ownable focus-cyan `#22D3EE` against the app’s indigo action color.

### Implementation and data boundaries

- Add a lazy-loaded `src/pages/StudyStudio.tsx`, focused components under `src/components/study/`, and pure timer/learning logic under `src/lib/study/`. Reuse installed React, TypeScript, Tailwind, Zustand, Lucide icons, Supabase, and the current theme system; add no dependency for a timer or basic vector canvas.
- Extend the existing private Zustand snapshot with an optional, versioned Study Studio collection and make `importAll` merge missing fields to safe empty defaults. Bump the snapshot version only after preserving every existing collection and unknown compatible field. Account switching and sign-out must clear the on-device workspace exactly as the existing store does.
- Keep study notes as validated structured text blocks, not executable HTML. Store drawings as bounded vector strokes/shapes rather than a full raster image per pointer movement. Do not embed image bytes in the JSON snapshot; any later attachment feature must use the existing private media storage path.
- Persist timer transitions, not timer ticks. Keep a single active session with explicit running/paused/break/recovery states; derive elapsed focus from timestamps and exclude pause/break intervals. Finish is idempotent by stable session ID. Re-entry after ambiguous suspension asks whether to resume or discard rather than silently counting time away.
- Debounce notebook document commits before updating the shared Zustand snapshot so typing does not cause a Supabase write on every keystroke. Keep timer display ticks local to the timer component. Continue using the existing per-user `life_data` RLS and sync unless measured document growth demonstrates a need for an additive study-specific table; do not add a new migration or paid service merely for the first release.
- Build the supplied release-one core first: subject/topic CRUD, persistent focus and breaks, session journal, notebook autosave, basic touch/mouse drawing, and a functional overview. Implement a section only when its actions and saved data work end-to-end; leave concept maps, AI companion, exam mode, and other later-stage tools out of the active navigation until they are genuinely implemented. Do not claim attention measurement, guaranteed retention, or closed-app notifications.
- Preserve the current Pages route/base path and public pages. Any new route must be added to `public/manus-routes.json` and the static-page preparation path before dev-server preview or release.
