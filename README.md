# Noteleaf

**Ambient AI meeting notetaker. Listens through your mic. Never joins as a bot.**

Noteleaf sits open on your laptop while you meet — in a conference room, on a call, or at a desk. It listens through your microphone, captures what is being said in real time, and automatically organises speech into structured notes: action items, decisions, insights, and general observations. When you finish, the session produces a verbatim timestamped transcript, categorised note cards, and a clean AI meeting summary. Nothing joins your call. Nothing interrupts the meeting.

---

## What a session produces

| Artifact | Description |
|---|---|
| **Live transcript bar** | Partial speech with a visible “Transcription active” indicator |
| **Note cards** | Each finalised sentence classified as action / decision / insight / note |
| **Timestamped transcript** | Verbatim record of every segment with meeting-relative timestamps |
| **Meeting recap** | AI-generated summary with overview, decisions, action items, and insights |
| **Ask my notes** | Chat with the session — works **during** and after the meeting, with source citations |
| **Post-meeting workflows** | Copy recap, email draft, task checklist, export, and follow-up questions |

---

## How it works

### 1. Your microphone is the only input

Noteleaf uses your laptop mic or any connected microphone. It does not intercept your video call app, does not hook into Zoom or Teams or Meet, and does not appear as a participant. It works in physical rooms, on calls you attend, and in one-on-one conversations.

### 2. Speech recognition runs in the browser

Noteleaf uses the browser's built-in **Web Speech API** (Chrome and Edge). Audio is processed locally — no audio bytes are sent to any server. Interim results appear in the live transcript bar; finalised sentences go to the classifier.

> **Your audio never leaves your device.** Only the transcribed text is sent to Noteleaf's servers.

### 3. Every sentence is automatically classified

Each completed speech segment passes through a client-side classifier:

| Type | Meaning | Example triggers |
|---|---|---|
| **Action** | A task someone needs to do | "we need to", "follow up by Friday", "can you send" |
| **Decision** | A conclusion reached | "we decided", "confirmed", "going with", "agreed" |
| **Insight** | A notable idea or observation | "key point", "important", "realised", "idea" |
| **Note** | General statement | Everything else |

Classification runs instantly in the browser with zero server round-trip. The note card appears within a second of the words being spoken.

### 4. After recording stops, an AI recap is generated automatically

When you press stop, Noteleaf sends all captured notes and a portion of the raw transcript to **NVIDIA Nemotron 3 Super** via the Noteleaf API. The model returns a structured recap with overview, decisions, action items, and insights. The NVIDIA key never reaches the browser — all AI calls are proxied through the API server.

### 5. Ask my notes — live or after the meeting

Open the **Ask notes** tab anytime after speech is captured — including **while recording is still in progress**. The AI uses finalized notes, transcript segments, and your current partial speech. Every answer cites its source (`[1]`, `[2]`, …). Chat history is saved per session and restored after refresh.

### 6. Sessions sync to your account

Every session is saved to the database and linked to your account. You can access all past sessions from any browser after signing in.

### 7. Turn meetings into action

After recording stops, use **post-meeting workflows** to copy a recap, open an email draft, copy action items as a checklist, download a `.txt` export, or jump to Ask notes for follow-ups.

---

## Authentication

Noteleaf uses **httpOnly cookie auth** — tokens never touch JavaScript memory.

| Token | Storage | Lifetime |
|---|---|---|
| Access token (`nl_access`) | httpOnly cookie | 15 minutes |
| Refresh token (`nl_refresh`) | httpOnly cookie | 30 days, rotated on each use |

Sign in with either:

- **Google** — one click, no code entry required.
- **Email OTP** — enter your email, receive a 6-digit code, paste it in. Codes expire in 10 minutes and are single-use.

There are no passwords. Refresh tokens are revoked on sign-out and cascade-deleted when an account is removed.

---

## User guide

### Before the meeting

1. Open the app in **Chrome or Edge**.
2. Sign in with Google or your email address.
3. Click **+ New Session** in the sidebar (or use an existing one).
4. Open Noteleaf beside your call — Zoom, Teams, Google Meet, or an in-person conversation. The **Before → During → After** guide under the tabs shows where you are in the flow.

### During the meeting

1. Click the mic button. Allow microphone access when prompted.
2. Speak naturally. A **Transcription active** indicator appears in the live transcript bar.
3. Note cards appear as speech is finalized (action / decision / insight / note).
4. Switch to **Ask notes** anytime — ask what’s been discussed so far while the meeting continues.
5. Click the session title to name it — saves automatically on blur.
6. Click the pencil icon on any note to edit content or reclassify its type.

### After recording stops

1. The **Recap** tab generates automatically (5–15 seconds). A dot appears on the tab while loading.
2. Use **post-meeting workflows** — copy recap, email draft, copy tasks, download `.txt`, or ask follow-ups.
3. Switch to **Transcript** for the full verbatim record.
4. Switch to **Ask notes** for deeper Q&A with citations.
5. Click **Export** in the header at any time for a full session download.

### Managing sessions

Sessions appear in the left sidebar, newest first. Click any session to load it. Use the search bar to filter by title.

To **delete a session**: hover over it — a trash icon appears. Click it and confirm with **Yes**.

### Settings

Click the gear icon at the bottom of the sidebar.

| Section | What it controls |
|---|---|
| **Account** | Shows your name and email. Sign out button. |
| **Preferences** | Auto-classify notes, show live transcript, auto-tag keywords |
| **Session retention** | Keep sessions forever (default) or auto-delete after 30 days |
| **Danger zone** | Permanently delete your account and all sessions |
| **Legal** | Link to Terms & Privacy |

---

## What Noteleaf does not do

**It does not record audio files.** Audio is processed in the browser in real time and discarded. Only transcribed text is stored.

**It does not identify speakers.** All speech is captured as one stream.

**It does not work offline.** AI summary and chat require internet access to reach NVIDIA's API.

**It is not a legal-grade transcription service.** The Web Speech API works well in clear acoustic conditions. Heavy accents, technical jargon, and simultaneous speakers reduce accuracy.

**The free NVIDIA API has rate limits.** Approximately 40 requests per minute — sufficient for a single user.

---

## Developer setup

### Prerequisites

- Node.js 20 or higher
- Docker and Docker Compose
- A free NVIDIA Build API key — [build.nvidia.com](https://build.nvidia.com)
- Optional: A Resend API key for real email delivery — [resend.com](https://resend.com)

### Getting an NVIDIA API key

1. Go to [build.nvidia.com](https://build.nvidia.com) and sign in or create a free account.
2. Open any model page and click **Get API Key**.
3. Copy the key — it starts with `nvapi-`.

### Getting a Resend API key (optional)

Without a Resend key, OTP codes are returned in the API response so you can still test the email sign-in flow in development.

1. Sign up at [resend.com](https://resend.com) — free tier: 3,000 emails/month.
2. Create an API key and add it to your root `.env` as `RESEND_API_KEY=re_...`.
3. Add `FROM_EMAIL=you@yourdomain.com` if you have a verified sender domain. Without it, the default sender is `onboarding@resend.dev`, which only delivers to the Resend account owner's address — the OTP code will still appear in the app's amber hint box.

### Getting a Google OAuth client (optional)

Without a Google client, the "Continue with Google" button is disabled.

1. Open [console.cloud.google.com](https://console.cloud.google.com).
2. Create a project, enable the **Google+ API**, and create OAuth credentials.
3. Set the authorised redirect URI to `http://localhost:3002/api/auth/google/callback`.
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your `.env`.

---

### Running with Docker (recommended)

```bash
# 1. Clone the repository
git clone <repo-url> noteleaf && cd noteleaf

# 2. Create root .env (see Environment variables above)
nano .env

# 4. Start the full stack
docker compose up --build
```

Docker starts four services:

| Service | Role | Port |
|---|---|---|
| **postgres** | PostgreSQL 16 database | internal |
| **migrate** | Runs Prisma migrations, then exits | — |
| **api** | Fastify REST API (port 3001 in container) | 3002 on host |
| **web** | Next.js frontend (port 3000 in container) | 3003 on host |

| Endpoint | URL |
|---|---|
| Web app | http://localhost:3003 |
| API | http://localhost:3002 |
| Health check | http://localhost:3002/api/health |

```bash
# Stop
docker compose down

# Stop and wipe the database
docker compose down --volumes

# Rebuild after code changes
docker compose up --build
```

### Running without Docker

Requires Node.js 20+ and a local PostgreSQL 15+ instance.

```bash
# Install dependencies
npm install

# Configure root .env (DATABASE_URL host port 5433, JWT_SECRET, NVIDIA_API_KEY)

# Generate the Prisma client and run migrations
cd apps/api && npx prisma generate && npx prisma migrate deploy && cd ../..

# Start both apps in watch mode
npm run dev
```

---

### Environment variables

**Local:** root `.env` (gitignored). **Production:** root `.env.production` (gitignored) — copy values into Render and Vercel.

| Variable | Local default | Production |
|---|---|---|
| `APP_URL` | `http://localhost:3003` | `https://noteleaf.vercel.app` |
| `ALLOWED_ORIGINS` | `http://localhost:3003` | `https://noteleaf.vercel.app` |
| `API_INTERNAL_URL` | `http://localhost:3001` | `https://noteleaf-api.onrender.com` (Vercel only) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3003` | `https://noteleaf.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3002` | `https://noteleaf.vercel.app` (same origin; `/api` proxied) |
| `API_URL` | `http://localhost:3002` | `https://noteleaf-api.onrender.com` |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Docker Postgres `:5433` | Neon pooled + direct |
| `NVIDIA_API_KEY`, `JWT_SECRET` | required | required |

---

## Deployment

Markdown docs are **not** deployed. What ships when you push `main`:

| File | Platform | What it does |
|------|----------|----------------|
| **`apps/web/vercel.json`** | Vercel | Build command + `API_INTERNAL_URL` / `NEXT_PUBLIC_*` |
| **`turbo.json`** | Vercel | Passes env vars into `next build` |
| **`render.yaml`** | Render (optional Blueprint) | Docker API + public env defaults |
| **`.env.production`** | Neither (gitignored) | You paste secrets into Render + Vercel dashboards |

**Live URLs:** [noteleaf.vercel.app](https://noteleaf.vercel.app) · API [noteleaf-api.onrender.com](https://noteleaf-api.onrender.com)

**Render dashboard** (required secrets from `.env.production`): `DATABASE_URL`, `DIRECT_DATABASE_URL`, `JWT_SECRET`, `NVIDIA_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, plus `APP_URL` / `ALLOWED_ORIGINS` = `https://noteleaf.vercel.app` (already in `render.yaml` if you use Blueprint).

**Vercel dashboard:** also set `GOOGLE_CLIENT_ID` (same public value as Render — not the secret). That lets “Continue with Google” jump straight to Google’s account picker instead of waiting for the API to boot.

**Google OAuth redirect URI:** `https://noteleaf.vercel.app/api/auth/google/callback`

```bash
npm run verify
npm run db:migrate:prod
curl -s https://noteleaf.vercel.app/api/health
```

**Troubleshooting:** 508 loop → `API_INTERNAL_URL` must be Render, not Vercel. `redirect_uri_mismatch` → set Render `APP_URL` to Vercel URL and redeploy API. Google still shows a Render boot screen → add `GOOGLE_CLIENT_ID` on Vercel and redeploy the web app.

**Local Docker:**

```bash
docker compose up --build -d
curl -s http://localhost:3002/api/health
```

---

### Running tests and validation

```bash
# Full monorepo pipeline (requires Node 20+, npm 10+)
npm run type-check
npm run lint
npm run test
npm run build

# Individual apps
cd apps/web && npm run test
cd apps/api && npm run test
```

The web app includes unit tests for the note classifier and note writer (33 tests). API Vitest uses `passWithNoTests: true` when no smoke tests are present.

---

### Linting

ESLint 9 flat config lives at the repo root (`eslint.config.mjs`). Each app runs `eslint src` via Turbo:

```bash
npm run lint
```

---

## Architecture

### Monorepo structure

```
noteleaf/
├── apps/
│   ├── web/          Next.js 16 frontend   (TypeScript · Tailwind · Zustand · React Query)
│   └── api/          Fastify 5 backend     (TypeScript · Prisma 6 · PostgreSQL 16)
└── packages/
    └── shared-types/ TypeScript contracts shared between both apps
```

The two apps share no runtime code — only types, through `@noteleaf/shared-types`. Any shape used in an API response is defined once and imported by both sides. There is no type drift between what the server sends and what the client expects.

---

### Request authentication

Protected API routes read the **`nl_access` httpOnly cookie** (or `Authorization: Bearer` for programmatic clients). The token is a signed JWT (HS256, 15-minute expiry) produced at sign-in. The API verifies the signature, extracts the `userId`, and scopes all DB queries to that user.

When the access token expires, the client calls `POST /api/auth/refresh` with the `nl_refresh` cookie. Refresh tokens are rotated on every use, stored as SHA-256 hashes in the database, and revoked on sign-out. Deleting an account cascade-deletes all refresh tokens, sessions, and OTP codes.

Next.js rewrites `/api/*` to the Fastify server, so browser requests are same-origin and cookies are sent automatically (`credentials: 'include'`).

---

### Speech-to-text pipeline

```
Browser microphone
    │
    ▼
Web Speech API  (browser-native · Chrome / Edge)
  Interim results → live transcript bar
  Final results   → classifier
    │  (no audio leaves the device)
    ▼
useNoteClassifier  (client-side hook)
  Quality gate: ≥ 15 chars · ≥ 0.5 confidence
  Classifies → action | decision | insight | note
  Extracts up to 3 keyword tags
    │
    ▼
Zustand session store
  appendNote → activeNotes
  appendTranscriptSegment → activeTranscriptSegments
    │
    ▼
Note card renders instantly
Session persisted to API on recording stop via PATCH /api/sessions/:id
```

---

### AI summary + chat pipeline

```
Recording stops
    │
    ▼
POST /api/ai/summarize
  Payload: notes · transcript excerpt · session title
  Auth: Bearer token (userId scoped)
    │
    ▼
NVIDIA Nemotron 3 Super 120B
  temperature=0 · JSON output
  Returns: { overview, decisions, actionItems, insights }
    │
    ▼
API persists AiSummary to PostgreSQL
Response returned to client → Summary tab renders

──────────────────────────────────────

User asks a question in Ask notes tab
    │
    ▼
POST /api/chat/ask
  Payload: sessionId · question · session notes · transcript segments · history
  Auth: httpOnly cookie (session must belong to user)
    │
    ▼
NVIDIA Nemotron 3 Super 120B
  Instructed to cite every claim with [N] markers
  Returns: { answer, citations[] }
    │
    ▼
API appends user + assistant messages to session.chat_messages (JSONB)
Answer renders with inline citation markers
Each cited source shown as a quote card
```

---

### Database schema

```
users
  id (uuid PK) · email · name · avatar · google_id · retention_days
  └── sessions (cascade delete)
  └── refresh_tokens (cascade delete)

sessions
  id (uuid PK) · user_uuid (FK → users) · title
  notes (jsonb) · transcript · transcript_segments (jsonb) · chat_messages (jsonb)
  duration_seconds · status (enum) · created_at · updated_at
  └── ai_summaries (cascade delete)

ai_summaries
  id (uuid PK) · session_id (FK → sessions)
  overview · decisions (jsonb) · action_items (jsonb) · insights (jsonb)
  model_used · created_at

otp_codes
  id (uuid PK) · email · code_hash · expires_at · used_at · attempts

refresh_tokens
  id (uuid PK) · user_id (FK → users) · token_hash (unique)
  expires_at · revoked_at · created_at

user_emails (legacy email-to-uuid mapping)
  email (PK) · user_uuid · created_at
```

---

### State management

| Store | What it holds | Persistence |
|---|---|---|
| `auth.store` | Current user from `/api/auth/me` | httpOnly cookies (server-managed) |
| `user.store` | UI preferences (autoClassify, retentionDays, etc.) | localStorage |
| `session.store` | Active session notes, transcript, session list | In-memory; server is source of truth after load |

React Query is the source of truth for server data. Zustand `session.store` holds optimistic state during recording. On each query invalidation after recording stops, React Query re-fetches and the merged list updates.

---

### Key design decisions

**Web Speech API instead of server-side STT** — Audio never leaves the device for transcription. No WebSocket audio proxy, no audio format conversion, no added latency. Trade-off: Chrome and Edge only; Firefox is not supported.

**JWT + refresh token auth instead of UUID-only** — Proper revocation on sign-out and account deletion. UUID-only credentials had no way to invalidate a compromised token.

**Notes stored as JSONB in the sessions table** — Notes are always loaded with their session. A separate notes table would add a join with no benefit. JSONB allows future GIN indexing for full-text search.

**Zustand for in-session state** — The recording hot path appends a note every ~3 seconds. Zustand's synchronous updates are zero-cost. React Query handles all server state separately.

**Client-side classifier** — `noteClassifier.ts` is a pure function: string in, NoteType out. No hooks, no I/O, fully unit-testable without a browser.

---

## API reference

All routes except `/api/health` require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/auth/google` | Redirect to Google OAuth |
| `GET` | `/api/auth/google/callback` | Handle Google OAuth callback, issue tokens |
| `POST` | `/api/auth/email/send` | Send 6-digit OTP to email (max 3 per 10 min) |
| `POST` | `/api/auth/email/verify` | Verify OTP, issue JWT + refresh token |
| `POST` | `/api/auth/refresh` | Rotate refresh token, issue new access token |
| `POST` | `/api/auth/signout` | Revoke refresh token |
| `GET` | `/api/auth/me` | Return current user from JWT |
| `DELETE` | `/api/auth/account` | Delete account and all data (cascade) |
| `PATCH` | `/api/user/preferences` | Update server-side preferences (retentionDays) |
| `GET` | `/api/sessions` | List all sessions for the authenticated user |
| `GET` | `/api/sessions/:id` | Get one session with notes and AI summary |
| `POST` | `/api/sessions` | Create a new session |
| `PATCH` | `/api/sessions/:id` | Update title, notes, transcript, status |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `POST` | `/api/ai/summarize` | Generate and persist an AI meeting recap |
| `POST` | `/api/chat/ask` | Chat with a session's notes and transcript (persists history) |
| `GET (WS)` | `/api/stt/stream` | WebSocket STT proxy (self-hosted NVIDIA NIM mode) |

---

## Project file reference

```
packages/shared-types/src/
  index.ts              — single import point for all shared types
  user.types.ts         — UserPreferences, defaultUserPreferences
  note.types.ts         — Note, NoteType, ClassifierInput/Output
  session.types.ts      — Session, SessionListItem, AiSummary, TranscriptSegment
  api.types.ts          — every API request and response shape
  chat.types.ts         — ChatMessage, ChatCitation, AskNotesRequest/Response
  identity.types.ts     — SendCodeRequest/Response, VerifyCodeRequest/Response
  nvidia.stt.types.ts   — NVIDIA NIM streaming types (self-hosted mode)

apps/api/src/
  server.ts                        — Fastify app factory and startup
  lib/auth.ts                      — JWT sign/verify, refresh token and OTP helpers, requireAuth guard
  prisma.plugin.ts                 — Prisma client as a Fastify decorator
  logger.ts                        — Structured Pino logger
  routes/auth.route.ts             — Google OAuth, email OTP, token refresh, sign-out, account delete
  routes/sessions.route.ts         — CRUD for sessions (auth scoped)
  routes/summarize.route.ts        — POST /api/ai/summarize → NVIDIA LLM
  routes/chat.route.ts             — POST /api/chat/ask → NVIDIA LLM
  routes/identity.route.ts         — Legacy email-to-UUID recovery (deprecated)
  routes/health.route.ts           — GET /api/health
  routes/stream.route.ts           — WebSocket STT proxy (self-hosted NIM mode)
  services/nvidia.llm.service.ts   — NVIDIA Nemotron API wrapper (summary + chat)
  services/nvidia.stt.service.ts   — NVIDIA NIM gRPC STT wrapper (self-hosted mode)
  prisma/schema.prisma             — Full database schema
  prisma/migrations/               — SQL migration history

apps/web/src/
  app/layout.tsx                   — Root Next.js layout (fonts, providers)
  app/page.tsx                     — Home page (AuthGuard → NotepadShell)
  app/auth/page.tsx                — Sign-in page route
  app/terms/page.tsx               — Terms & Privacy page

  components/layout/
    NotepadShell.tsx               — Main app shell: recording, sessions, tabs, settings
    NavigationSidebar.tsx          — Left sidebar: session list, search, new session
    SessionTranscriptPanel.tsx     — Right panel: searchable live + stored transcript
    AuthGuard.tsx                  — Redirects unauthenticated users to /auth
    Providers.tsx                  — React Query client and store hydration

  components/auth/
    SignInPage.tsx                 — Email OTP + Google OAuth sign-in form

  components/ui/
    Button.tsx                     — Button with variant and size props
    Toggle.tsx                     — Accessible toggle switch
    Badge.tsx                      — Type/status badge chip

  features/recording/hooks/
    useRecordingState.ts           — Recording orchestrator: mic → classifier → store → API
    useSpeechRecognition.ts        — Web Speech API wrapper (continuous, auto-restart)
    useAudioCapture.ts             — MediaRecorder wrapper (used by STT WebSocket mode)
    useSTTWebSocket.ts             — WebSocket STT client (self-hosted NIM mode)

  features/notes/
    useNoteClassifier.ts           — Quality-gated classifier hook
    components/NoteCard.tsx        — Editable note card with inline type reclassification
    components/AiSummaryCard.tsx   — AI recap card (loading / success / error / retry)
  features/meeting/components/
    TabCoachPopover.tsx            — Minimal tab coach popover
    MeetingHowToStrip.tsx          — Meeting how-to strip
    MeetingPhaseGuide.tsx          — Phase guide (notes tab)
    PostMeetingActions.tsx         — Post-meeting action shortcuts

  features/chat/
    ChatPanel.tsx                  — Ask my notes UI with citation cards

  features/sessions/
    sessions.api.ts                — Typed wrappers for all session HTTP calls

  store/
    auth.store.ts                  — Current user; cookie session via /api/auth/me
    user.store.ts                  — UI preferences (persisted to localStorage)
    session.store.ts               — In-memory session list, active session notes/transcript

  lib/
    http.client.ts                 — Typed fetch wrapper (cookies, silent refresh on 401)
    noteClassifier.ts              — Pure classification function
    noteWriter.ts                  — Human-style note formatting from STT text
    instantRecap.ts                — Instant recap draft before LLM enhancement
    sessionContext.ts              — Payload builders for summarize + chat APIs
    suggestedQuestions.ts          — Ask notes suggested question rotation
    tabCoachMessages.ts            — Per-tab coach popover copy
    exportFormatter.ts             — .txt export builder and browser download trigger
    cn.ts                          — Tailwind class merge utility

  styles/
    tokens.css                     — Design tokens (colours, radius, shadows, sidebar palette)
    globals.css                    — Font variables, base resets, scrollbar, selection styles
```
