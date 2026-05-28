# Noteleaf

**Ambient AI meeting notetaker. Listens through your mic. Never joins as a bot.**

Noteleaf sits open on your laptop while you meet — in a conference room, on a call, or at a desk. It listens through your microphone, captures what is being said in real time, and automatically organises speech into structured notes: action items, decisions, insights, and general observations. When you finish, the session produces a verbatim timestamped transcript, categorised note cards, and a clean AI meeting summary. Nothing joins your call. Nothing interrupts the meeting.

---

## What a session produces

| Artifact | Description |
|---|---|
| **Live transcript bar** | Partial speech shown word-by-word as you speak |
| **Note cards** | Each finalised sentence classified as action / decision / insight / note |
| **Timestamped transcript** | Verbatim record of every segment with meeting-relative timestamps |
| **Meeting recap** | AI-generated summary with overview, decisions, action items, and insights |
| **Ask my notes** | Chat with the session's notes and transcript — every answer cites its source |

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

### 5. Ask my notes — session-scoped chat with citations

Open the **Ask notes** tab to chat with the session. Ask anything about the meeting and the AI answers using only the notes and transcript from that session. Every claim is backed by an inline citation (`[1]`, `[2]`) pointing to the exact source.

### 6. Sessions are stored in your account

Every session is saved to the database and linked to your account. You can access all past sessions from any browser after signing in. After recording stops, a banner offers a local `.txt` download if you want a copy on your device.

---

## Authentication

Noteleaf uses **JWT access tokens** (1 hour) and **refresh tokens** (30 days, rotated on each use). Sign in with either:

- **Google** — one click, no code entry required.
- **Email OTP** — enter your email, receive a 6-digit code, paste it in. Codes expire in 10 minutes and are single-use.

There are no passwords. Tokens are stored in `localStorage`. The refresh token is revoked on sign-out.

---

## User guide

### Getting started

1. Open the app in Chrome or Edge.
2. Sign in with Google or your email address.
3. Click **+ New Session** in the sidebar.
4. Click the mic button at the bottom. Allow microphone access when prompted.
5. Start talking. Note cards appear as you speak.

### During a meeting

- The live transcript bar shows partial speech in real time.
- Each finalised sentence becomes a note card with its type badge, capture time, content, and keyword tags.
- Click the session title at the top to name the session — it saves automatically on blur.
- Click the pencil icon on any note card to edit its content or reclassify its type.

### After recording stops

- The AI recap generates automatically (5–15 seconds). A dot indicator appears on the Summary tab.
- A download banner appears — click **Download .txt** to save a local copy, or dismiss it.
- Switch to **Transcript** for the full verbatim record.
- Switch to **Ask notes** to chat with the session content.
- Click **Export** in the top right at any time to download a `.txt` file.

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

# 2. Create the environment file
cp .env.example .env

# 3. Fill in your credentials — at minimum NVIDIA_API_KEY
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

# Configure the API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL, JWT_SECRET, NVIDIA_API_KEY

# Generate the Prisma client and run migrations
cd apps/api && npx prisma generate && npx prisma migrate deploy && cd ../..

# Start both apps in watch mode
npm run dev
```

---

### Environment variables

Root `.env` (used by Docker Compose):

| Variable | Required | Default | Description |
|---|---|---|---|
| `NVIDIA_API_KEY` | **Yes** | — | Free key from build.nvidia.com |
| `JWT_SECRET` | **Yes** | dev fallback | Secret used to sign JWT tokens. Change before any deployment. |
| `POSTGRES_PASSWORD` | **Yes** | `change_me` | PostgreSQL password. Change before any deployment. |
| `RESEND_API_KEY` | No | — | Resend key for email delivery. Without it, OTP codes appear in the API response. |
| `FROM_EMAIL` | No | `Noteleaf <onboarding@resend.dev>` | Sender address (must be verified in Resend if using a custom domain) |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `APP_URL` | No | `http://localhost:3003` | URL the browser uses to reach the frontend (used for OAuth redirect) |
| `WEB_PORT` | No | `3003` | Host port for the Next.js app |
| `API_PORT` | No | `3002` | Host port for the Fastify API |
| `ALLOWED_ORIGINS` | No | `http://localhost:3003` | Comma-separated CORS origins |
| `NODE_ENV` | No | `production` | Set to `development` for verbose logs and full error details |

---

### Running tests

```bash
# All tests
npm run test

# Web unit tests only (Vitest)
cd apps/web && npm run test

# Watch mode
cd apps/web && npm run test:watch
```

The note classifier has the broadest coverage — 27 tests covering all four types, edge cases, tag extraction, and the full note-building pipeline.

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

Every protected API route reads an `Authorization: Bearer <token>` header. The token is a signed JWT (HS256, 1-hour expiry) produced at sign-in. The API verifies the signature, extracts the `userId`, and scopes all DB queries to that user.

When a token expires, the client transparently calls `POST /api/auth/refresh` with the stored refresh token to get a new pair. Refresh tokens are rotated on every use, stored as SHA-256 hashes in the database, and revoked on sign-out. Deleting an account cascade-deletes all refresh tokens, sessions, and OTP codes.

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
  Payload: question · session notes · transcript segments · history
  Context limited to this session only
    │
    ▼
NVIDIA Nemotron 3 Super 120B
  Instructed to cite every claim with [N] markers
  Returns: { answer, citations[] }
    │
    ▼
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
  notes (jsonb) · transcript · transcript_segments (jsonb)
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
| `auth.store` | JWT token, refresh token, decoded user | localStorage |
| `user.store` | UI preferences (autoClassify, retentionDays, etc.) | localStorage |
| `session.store` | Active session notes, transcript, session list | In-memory only |

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
| `POST` | `/api/chat/ask` | Chat with a session's notes and transcript |
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

  features/chat/
    ChatPanel.tsx                  — Ask my notes UI with citation cards

  features/sessions/
    sessions.api.ts                — Typed wrappers for all session HTTP calls

  store/
    auth.store.ts                  — JWT token, refresh token, user object, sign-out
    user.store.ts                  — UI preferences (persisted to localStorage)
    session.store.ts               — In-memory session list, active session notes/transcript

  lib/
    http.client.ts                 — Typed fetch wrapper with Bearer auth and silent token refresh
    noteClassifier.ts              — Pure classification function (27 unit tests)
    exportFormatter.ts             — .txt export builder and browser download trigger
    cn.ts                          — Tailwind class merge utility

  styles/
    tokens.css                     — Design tokens (colours, radius, shadows, sidebar palette)
    globals.css                    — Font variables, base resets, scrollbar, selection styles
```
