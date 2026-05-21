# Noteleaf

**Ambient AI meeting notetaker. Listens through your mic. Never joins as a bot.**

Noteleaf sits open on your laptop while you meet — in a conference room, on a call, or in a café. It listens through your microphone, captures what is being said in real time, and automatically organises the speech into structured notes: action items, decisions, insights, and general observations. When you finish, the session produces three artifacts: a verbatim timestamped transcript, categorised note cards, and a clean AI meeting summary. Nothing joins your call. Nothing interrupts the meeting.

---

## What it produces from a single recording session

| Artifact | What it is |
|---|---|
| **Live transcript bar** | Partial speech shown word-by-word as you speak |
| **Note cards** | Each finalised sentence classified as action / decision / insight / note |
| **Timestamped transcript** | Verbatim record of every finalised segment with meeting-relative offsets |
| **Meeting recap** | AI-generated summary with overview, decisions, action items, and insights |
| **Ask my notes** | Chat with your session's notes and transcript — every answer cites the exact source |

---

## How it works

### 1. Your microphone is the only input

Noteleaf uses your laptop's microphone or any connected mic. It does not intercept your video call application, does not hook into Zoom or Teams or Meet, and does not appear as a participant. It works equally in three situations most tools handle poorly:

- A physical meeting in a conference room
- A video call you are attending, audio heard through speakers or headset
- A one-on-one conversation at a desk

### 2. Speech recognition happens in the browser

Noteleaf uses the browser's built-in **Web Speech API** (supported in Chrome, Edge, and Safari). Audio is processed locally by the browser — no audio bytes are sent to any server for transcription. Interim results appear in the live transcript bar as you speak; finalised sentences are passed to the classifier.

> **No microphone audio leaves your device.** The only data that reaches the Noteleaf server are the text transcripts and notes — not the audio.

### 3. Every finalised sentence is automatically classified

Each completed speech segment goes through a client-side classification engine:

| Type | What it means | Example triggers |
|---|---|---|
| **Action** | A task someone needs to do | "we need to", "follow up by Friday", "can you send" |
| **Decision** | A conclusion reached | "we decided", "confirmed", "going with", "agreed" |
| **Insight** | A notable idea or observation | "key point", "important", "realized", "idea" |
| **Note** | General statement, no specific type | Everything else |

Classification happens instantly in the browser with zero server round-trip. The note card appears within a second of the words being spoken.

### 4. After recording stops, the AI recap is generated automatically

When you press stop, Noteleaf sends all captured notes and a portion of the raw transcript to **NVIDIA's Nemotron 3 Super** — a 120-billion-parameter language model on NVIDIA's free cloud tier. The model returns a structured meeting recap with overview, decisions, action items, and insights. This appears as a card at the bottom of the session, and is included in any file export.

The NVIDIA API key never reaches the browser. All AI calls are proxied through the Noteleaf API server.

### 5. Ask my notes — session-scoped chat with citations

Switch to the **Ask notes** tab to open the built-in chat assistant. You can ask any question about the meeting and the AI answers using only the notes and transcript from that session — it cannot draw on outside knowledge. Every claim in the answer is backed by an inline citation (`[1]`, `[2]`) pointing to the exact note or transcript segment the answer came from.

### 6. Notes are saved to your chosen storage

On first launch, Noteleaf asks how you want notes stored. The choice is yours and can be changed in Settings at any time.

**Cloud** — Notes are saved to the Noteleaf API server, indexed by a UUID generated on your device. Any browser that has your UUID can access all past sessions. No account, no password.

**Local → Download** — When recording stops, a `.txt` file (containing notes, transcript, and AI recap) is downloaded automatically.

**Local → Folder** — Grant Noteleaf one-time access to a folder on your machine. Files are written there automatically after each session.

### 7. Cross-device recovery via email

In Settings → **Cross-device recovery**, link a recovery email to your UUID. Noteleaf sends a one-time 6-digit code to that email (via Resend). Verify the code and the link is stored. On a new device, enter the same email to recover your UUID and regain access to all cloud sessions.

---

## User guide

### Getting started

1. Open the app in Chrome or Edge at [http://localhost:3003](http://localhost:3003) (or your deployed URL).
2. Choose your storage preference — **Cloud** is recommended if you want history across devices.
3. If you chose Cloud: your UUID is shown on screen. Save it somewhere safe (password manager, phone note). It is your only credential.
4. Click **+ New Session** in the sidebar to create a session.
5. Click the mic button at the bottom. Your browser will ask for microphone permission — click Allow.
6. Start talking. Note cards appear as you speak.

### During a meeting

- The live transcript bar at the top of the notes area shows partial speech in real time (italic, grey).
- Each finalised sentence becomes a note card with its type badge, capture time, content, and keyword tags.
- Click the session title field at the top and type to name the session — saves automatically.
- You can **edit any note** by clicking the pencil icon on its card. You can change both the content and the classification type.

### After recording stops

- The AI meeting recap is generated automatically (takes 5–15 seconds). A "Generating your summary — please wait" indicator shows while it runs.
- The recap card appears at the bottom of the Notes tab with overview, decisions, action items, and insights.
- Switch to the **Transcript** tab to read the full verbatim transcript.
- Switch to the **Ask notes** tab to chat with the session content.
- Press **Export** (toolbar, top right) to download a `.txt` file of everything.

### Reviewing past sessions

Sessions appear in the left sidebar. Click any session to load its notes, transcript, and AI recap. Use the search bar at the top of the sidebar to filter by title.

To **delete a session**: hover over it in the sidebar — a trash icon appears. Click it, then confirm with **Yes** in the inline prompt that appears.

### Settings

Click the gear icon at the bottom of the sidebar.

| Setting | What it controls |
|---|---|
| Storage preference | Cloud or Local (Download / Folder) |
| Recovery email | Link an email for cross-device UUID recovery |
| Auto-classify notes | Enable/disable automatic type labelling |
| Show live transcript | Show/hide the real-time partial transcript bar |
| Auto-tag keywords | Enable/disable keyword tag extraction per note |

---

## What Noteleaf does not do

**It does not record audio files.** Audio is processed in the browser in real time and discarded. Only transcribed text is stored.

**It does not identify speakers.** All speech is captured as one stream. Speaker diarisation is not implemented.

**It does not work offline.** AI summary and chat require internet access to reach NVIDIA's API.

**It is not a legal-grade transcription service.** The browser's Web Speech API produces useful meeting transcripts in clear acoustic conditions. Heavily accented speech, technical jargon, and multiple simultaneous speakers reduce accuracy.

**It does not work well in very noisy environments.** A USB conference microphone or noise-cancelling headset improves accuracy significantly in challenging rooms.

**The free NVIDIA API has rate limits.** Approximately 40 requests per minute. Sufficient for a single user summarising one session at a time; teams sharing one key may see occasional delays.

---

## Developer setup

### Prerequisites

- Node.js 20 or higher
- Docker and Docker Compose
- A free NVIDIA Build API key (for AI summary and chat)
- Optional: A Resend API key (for email-based UUID recovery)

### Getting an NVIDIA API key

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign in or create a free NVIDIA Developer account (no credit card required)
3. Open any model page and click **Get API Key**
4. Copy the key — it begins with `nvapi-`

This single key powers both AI summary generation and the "Ask my notes" chat. The free tier is rate-limited but has no time or usage cap.

### Getting a Resend API key (optional, for email delivery)

Without a Resend key, verification codes are returned directly in the API response so you can still test the recovery flow.

1. Sign up at [resend.com](https://resend.com) — free tier: 3,000 emails/month
2. Create an API key
3. Add it to your root `.env` as `RESEND_API_KEY=re_...`
4. Optionally add `FROM_EMAIL=you@yourdomain.com` (must be a verified sender in your Resend dashboard)

---

### Running with Docker (recommended)

```bash
# 1. Clone the repository
git clone <repo-url> noteleaf
cd noteleaf

# 2. Create the environment file
cp .env.example .env

# 3. Fill in your credentials
#    Required: NVIDIA_API_KEY
#    Optional: RESEND_API_KEY (for real email delivery)
nano .env   # or open in your editor

# 4. Start the full stack
docker compose up --build
```

Docker starts four services in dependency order:

| # | Service | Role | Exits after? |
|---|---|---|---|
| 1 | **postgres** | PostgreSQL 16 database | No |
| 2 | **migrate** | Runs Prisma migrations | Yes (one-shot) |
| 3 | **api** | Fastify REST + WebSocket API | No |
| 4 | **web** | Next.js frontend | No |

| Endpoint | URL |
|---|---|
| Web application | http://localhost:3003 |
| API server | http://localhost:3002 |
| Health check | http://localhost:3002/api/health |

```bash
# Stop
docker compose down

# Stop and wipe the database (all cloud notes deleted)
docker compose down --volumes

# Development mode with hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Running without Docker

Requires Node.js 20+ and a local PostgreSQL 15+ instance.

```bash
# 1. Install all workspace dependencies
npm install

# 2. Configure the API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your DATABASE_URL and NVIDIA_API_KEY

# 3. Optionally configure the web app
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local — defaults work for local development

# 4. Generate the Prisma client and run migrations
cd apps/api && npm run db:generate && npm run db:migrate && cd ../..

# 5. Start both servers in watch mode
npm run dev
```

---

### Environment variables

**Root `.env` (Docker Compose):**

| Variable | Required | Default | Description |
|---|---|---|---|
| `NVIDIA_API_KEY` | **Yes** | — | Free key from build.nvidia.com |
| `RESEND_API_KEY` | No | — | Resend key for email delivery. If blank, codes are returned in the API response. |
| `FROM_EMAIL` | No | `Noteleaf <onboarding@resend.dev>` | Sender address (must be verified in Resend) |
| `POSTGRES_PASSWORD` | **Yes** | `change_me_in_production` | Change before any public deployment |
| `WEB_PORT` | No | `3003` | Host port for the Next.js app |
| `API_PORT` | No | `3002` | Host port for the Fastify API |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3002` | URL the browser uses to reach the API |
| `ALLOWED_ORIGINS` | No | `http://localhost:3003,http://web:3000` | CORS origins |
| `NODE_ENV` | No | `production` | `development` enables verbose logs and error details |

---

### Running tests

```bash
# All tests
npm run test

# Web unit tests only
cd apps/web && npm run test

# Watch mode
cd apps/web && npm run test:watch
```

The note classifier has the broadest test coverage — 27 tests across all four classification types, edge cases, tag extraction, and the full note-building pipeline. It is a pure function and runs in under 50ms with no browser or server required.

---

## Architecture

### Overview

```
noteleaf/
├── apps/
│   ├── web/          Next.js 16 frontend  (TypeScript · Tailwind · Zustand · React Query)
│   └── api/          Fastify backend      (TypeScript · Prisma · PostgreSQL)
└── packages/
    └── shared-types/ TypeScript contracts imported by both apps
```

The two apps never share runtime code — only types, through `@noteleaf/shared-types`. Any shape used in an API response is defined once and imported by both. There is no type drift between what the server sends and what the client expects.

---

### Speech-to-text pipeline

```
Browser microphone
        │
        ▼
Web Speech API  (browser-native · Chrome / Edge / Safari)
  Processes audio entirely in the browser
  Interim results → live transcript bar (display only)
  Final results   → passed to classifier
        │  (no audio bytes leave the device)
        ▼
useNoteClassifier  (client-side hook)
  Quality gate: ≥ 15 characters · ≥ 0.5 confidence
  Classifies segment → action | decision | insight | note
  Extracts up to 3 keyword tags
  Builds a typed Note object
        │
        ▼
Zustand session store  (client-side)
  Appends note to activeNotes
  Appends TranscriptSegment with timestamps
        │
        ▼
Note card renders in the UI
Session data saved on recording stop:
  Cloud mode  → PATCH /api/sessions/:id
  Local mode  → IndexedDB  +  .txt file download / folder write
```

---

### AI summary + chat pipeline

```
Recording stops
        │
        ▼
POST /api/ai/summarize
  Payload: notes · transcript excerpt · session title
  Validated against session ownership (x-user-uuid header)
        │
        ▼
NVIDIA Nemotron 3 Super 120B  (integrate.api.nvidia.com/v1)
  temperature=0 · deterministic JSON output
  Returns: { overview, decisions, actionItems, insights }
        │
        ▼
API persists AiSummary → PostgreSQL
Session status → SUMMARISED
        │
        ▼
Meeting recap card renders in the UI
Included in file export

────────────────────────────────────

User asks a question in Ask notes tab
        │
        ▼
POST /api/chat/ask
  Payload: question · all session notes · all transcript segments · history
  Context is strictly limited to this session
        │
        ▼
NVIDIA Nemotron 3 Super 120B
  Instructed to cite every claim with [N] markers
  Returns: { answer, citations[] }
        │
        ▼
Answer renders with inline superscript citation markers
Each cited source shown as a coloured quote card
```

---

### Storage architecture

**Cloud mode** — Every session is stored in PostgreSQL, keyed by `userUuid`. The UUID is generated on the client, persisted in `localStorage`, and sent with every API request in the `x-user-uuid` header. No traditional authentication — UUID possession is the credential. Sessions are accessible from any device that knows the UUID.

**Local mode** — Notes accumulate in Zustand state and are persisted to **IndexedDB** (`noteleaf-local` database) for cross-session access within the browser. On session end, a `.txt` or `.md` file is exported (download or folder write). The API server is still called for the AI summary, but it does not persist session data.

**UUID recovery** — An email can be linked to a UUID via a Resend-delivered 6-digit code. The mapping (`user_emails` table) lets users recover their UUID on a new device by verifying ownership of the email.

---

### Key design decisions

**Web Speech API instead of server-side STT**
Audio never leaves the device for transcription. This eliminates the WebSocket audio proxy, reduces API load, removes the audio format conversion problem, and works without any server configuration. The trade-off is browser support (Chrome/Edge/Safari only; Firefox is not supported).

**Why the NVIDIA API key never touches the browser**
All NVIDIA API calls (AI summary, chat) are proxied through the Fastify server. The browser calls `/api/ai/summarize` and `/api/chat/ask`. The server holds the key.

**Why notes are JSONB in the sessions table**
Notes are always loaded with their session — there is no use case for notes without their parent. A separate notes table would add a join with zero benefit. JSONB allows GIN indexing for future full-text search.

**Why Zustand rather than Redux**
The recording hot path mutates state every ~3 seconds. Zustand's synchronous updates cost nothing. Redux's action-dispatch-reducer cycle would add latency. React Query handles server state (session list, session detail) separately.

**Why IndexedDB for local storage instead of localStorage**
localStorage has a hard 5 MB per-origin limit shared across all keys. IndexedDB is allocated from available disk space (effectively unlimited for text data) and uses async writes that do not block the main thread.

**Why the classifier is a pure function**
`noteClassifier.ts` takes a string and returns a `NoteType`. No hooks, no I/O, no side effects. Fully unit-testable without a browser or server. Every classification pattern is documented with its linguistic intent.

---

## Project file reference

```
packages/shared-types/src/
  index.ts              — single import point for all shared types
  user.types.ts         — UserIdentity, StorageMode, UserPreferences
  note.types.ts         — Note, NoteType, ClassifierInput/Output
  session.types.ts      — Session, AiSummary, SessionStatus, TranscriptSegment
  api.types.ts          — every API request and response shape
  chat.types.ts         — ChatMessage, ChatCitation, AskNotesRequest/Response
  identity.types.ts     — SendCodeRequest/Response, VerifyCodeRequest/Response
  nvidia.stt.types.ts   — NVIDIA NIM gRPC configuration (legacy, for self-hosted mode)

apps/api/src/
  server.ts                          — Fastify app factory and startup
  services/nvidia.llm.service.ts    — AI summary + chat via NVIDIA Nemotron
  services/nvidia.stt.service.ts    — STT proxy via NVIDIA NIM gRPC (self-hosted mode)
  routes/sessions.route.ts          — GET, POST, PATCH, DELETE /api/sessions
  routes/stream.route.ts            — WebSocket STT proxy (self-hosted mode)
  routes/summarize.route.ts         — POST /api/ai/summarize
  routes/chat.route.ts              — POST /api/chat/ask
  routes/identity.route.ts          — POST /api/identity/send-code, /verify-code
  routes/health.route.ts            — GET /api/health
  prisma.plugin.ts                  — Prisma client Fastify decorator
  logger.ts                         — Structured Pino logging
  riva_asr.proto                    — NVIDIA Riva gRPC service definition (self-hosted)
  prisma/schema.prisma              — Database schema (Session, AiSummary, UserEmail)
  prisma/migrations/                — SQL migration history

apps/web/src/
  lib/noteClassifier.ts             — Pure classification function (27 unit tests)
  lib/exportFormatter.ts            — .txt and .md export builders
  lib/localDb.ts                    — IndexedDB wrapper (idbStorage, saveSessionData, …)
  lib/http.client.ts                — Typed fetch wrapper with x-user-uuid injection

  features/recording/hooks/
    useSpeechRecognition.ts         — Web Speech API wrapper (continuous, auto-restart)
    useRecordingState.ts            — Recording orchestrator: hooks → classifier → store
  features/notes/
    useNoteClassifier.ts            — Quality-gated classifier hook
    components/NoteCard.tsx         — Editable note card with inline type reclassification
    components/AiSummaryCard.tsx    — Meeting recap card (loading / success / error)
  features/chat/
    ChatPanel.tsx                   — Ask my notes chat UI with citation cards
  features/identity/
    IdentityRecovery.tsx            — Email link / UUID recovery UI component
  features/sessions/
    sessions.api.ts                 — All session HTTP calls
    SessionSidebar.tsx              — Legacy sidebar component (superseded)
  features/storage/
    useStorageFolderHandle.ts       — File System Access API folder management
    components/StorageOnboarding.tsx — First-launch storage preference modal

  store/
    session.store.ts                — Sessions, notes, active state (Zustand + IDB persist)
    user.store.ts                   — UUID, email, storage preference, user preferences

  components/layout/
    NotepadShell.tsx                — Full application shell and state orchestration
    NavigationSidebar.tsx           — Dark nav sidebar (sessions list, search, delete)
    SessionTranscriptPanel.tsx      — Right-side searchable transcript panel
    Providers.tsx                   — React Query client and store hydration

  styles/
    tokens.css                      — Design tokens (colours, spacing, typography, sidebar)
    globals.css                     — Font application, resets, scrollbar, selection
```

---

## API routes reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check for load balancers |
| `GET` | `/api/sessions` | List all sessions for the authenticated UUID |
| `GET` | `/api/sessions/:id` | Get one session with notes, transcript, and AI summary |
| `POST` | `/api/sessions` | Create a new session |
| `PATCH` | `/api/sessions/:id` | Update title, notes, transcript, duration, status |
| `DELETE` | `/api/sessions/:id` | Delete a session and its summary |
| `POST` | `/api/ai/summarize` | Generate and persist an AI meeting recap |
| `POST` | `/api/chat/ask` | Ask a question about a session's notes and transcript |
| `POST` | `/api/identity/send-code` | Send a 6-digit verification code to an email address |
| `POST` | `/api/identity/verify-code` | Verify the code and link or recover a UUID |
| `GET (WS)` | `/api/stt/stream` | WebSocket STT proxy (used in self-hosted NIM mode) |

All routes except `/api/health` require an `x-user-uuid` header containing a valid UUID v4.
