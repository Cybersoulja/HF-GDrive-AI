# CLAUDE.md — HF-GDrive-AI

This file provides guidance for AI assistants working in this codebase.

---

## Project Overview

**HF-GDrive-AI** is a full-stack AI inference laboratory with two subsystems:

1. **Main App** — A React + Express web app for testing Hugging Face models via the HF Inference API. Users can run single prompts or multi-turn conversations with any HF model, tune generation parameters, and view streaming output with history tracking.
2. **File Server** — A standalone Express server for local file management with optional Google Drive synchronization.

---

## Repository Structure

```
/
├── client/                  # React frontend (Vite, TypeScript)
│   └── src/
│       ├── App.tsx          # Root router (Wouter)
│       ├── pages/
│       │   ├── Home.tsx     # Prompt tester (single-shot inference)
│       │   └── Chat.tsx     # Chat mode (multi-turn conversation)
│       ├── components/
│       │   ├── OutputDisplay.tsx   # Streaming markdown renderer
│       │   ├── HistoryPanel.tsx    # Past run history
│       │   ├── SettingsDialog.tsx  # API key configuration
│       │   └── ui/                 # shadcn/ui components (do not edit directly)
│       ├── lib/
│       │   ├── hf.ts        # Hugging Face API client (streaming SSE)
│       │   ├── store.ts     # Zustand state (persisted to localStorage)
│       │   ├── queryClient.ts  # TanStack Query setup
│       │   └── utils.ts     # Tailwind cn() helper
│       └── hooks/           # Custom hooks (toast, mobile detection)
├── server/                  # Express backend
│   ├── index.ts             # App initialization, middleware, port binding
│   ├── routes.ts            # API route registrations (template — extend here)
│   ├── storage.ts           # IStorage interface + in-memory implementation
│   ├── static.ts            # Static file serving for production
│   └── vite.ts              # Vite dev server integration
├── shared/
│   └── schema.ts            # Drizzle ORM schema + Zod validation types
├── cloudflare-worker/       # Cloudflare Worker — HF API proxy
│   ├── src/
│   │   └── index.ts         # Worker entry point (routes: /health, /v1/chat, /v1/raw)
│   ├── wrangler.toml        # Wrangler deployment config
│   ├── tsconfig.json        # Worker-specific TS config
│   └── package.json         # Worker dependencies (wrangler, @cloudflare/workers-types)
├── file-server/             # Standalone file + Google Drive server
│   ├── server.js            # Express server (port 3000)
│   ├── drive.js             # Google Drive API integration
│   ├── google-auth-setup.js # One-time OAuth flow for Drive credentials
│   └── package.json         # Separate dependency set for file-server
├── script/
│   └── build.ts             # Production build (esbuild + Vite)
├── vite.config.ts
├── tsconfig.json
├── drizzle.config.ts
└── package.json
```

---

## Development Commands

Run from the project root:

| Command | Description |
|---|---|
| `npm run dev` | Start Express backend with tsx (port 5000) |
| `npm run dev:client` | Start Vite HMR dev server (port 5000) |
| `npm run build` | Build client (Vite) + server (esbuild) → `dist/` |
| `npm start` | Run the production build |
| `npm run check` | TypeScript type checking (no emit) |
| `npm run db:push` | Apply Drizzle schema to database |

Run from `file-server/`:

| Command | Description |
|---|---|
| `npm start` | Start file server (port 3000) |
| `npm run auth` | Run Google Drive one-time OAuth setup |

---

## Architecture & Key Conventions

### Frontend

- **Router**: Wouter (not React Router). Routes are `"/"` (Home) and `"/chat"` (Chat).
- **State**: Zustand store in `client/src/lib/store.ts`, persisted to `localStorage` under key `hf-lab-storage`. Contains `apiKey`, `activeModelId`, `generationParams`, and `history`.
- **UI components**: shadcn/ui components live in `client/src/components/ui/`. Do not modify these manually — regenerate via the shadcn CLI if updates are needed.
- **Styling**: Tailwind CSS v4. Dark theme by default. Gold/yellow (`#f5c518`) accent color. JetBrains Mono for code, Inter for UI text.
- **Icons**: Lucide React only.
- **Notifications**: Sonner (`useToast` hook).

### HF API Client (`client/src/lib/hf.ts`)

- When `VITE_WORKER_URL` is set, all inference is routed through the Cloudflare Worker proxy (no API key in the browser).
- Without `VITE_WORKER_URL`, calls HF directly from the browser using the key stored in Zustand.
- Tries the OpenAI-compatible chat completions endpoint first; falls back to the raw text generation endpoint for models that don't support the chat format.
- Streaming via `ReadableStream` and SSE (`data: ...` line parsing).
- `AbortSignal` is wired end-to-end — the Stop button in both Home and Chat actually cancels the in-flight request.

### Cloudflare Worker (`cloudflare-worker/`)

The Worker is an HF API proxy that keeps the API key server-side as a Cloudflare secret.

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Validates the worker is running and `HF_API_KEY` is valid |
| `POST` | `/v1/chat` | Proxies to the HF chat completions endpoint with streaming passthrough |
| `POST` | `/v1/raw` | Proxies to the HF raw text generation endpoint (fallback for non-chat models) |

**Setup:**
```bash
cd cloudflare-worker
npm install
wrangler secret put HF_API_KEY   # store your HF token as a secret
npm run deploy                   # deploy to Cloudflare
```

Set `VITE_WORKER_URL` in the client (e.g. in `.env.local`) to the deployed Worker URL:
```
VITE_WORKER_URL=https://hf-gdrive-ai-worker.<your-subdomain>.workers.dev
```

**CORS:** Set `ALLOWED_ORIGIN` in `wrangler.toml` `[vars]` to your app's domain in production. It defaults to `"*"` for development.

### Backend

- **Routes**: Register new API routes in `server/routes.ts` using the `registerRoutes(app)` pattern.
- **Storage**: The `IStorage` interface in `server/storage.ts` defines the data access contract. The current `MemStorage` implementation is in-memory. Swap in a `DatabaseStorage` implementation when persistence is needed.
- **Database**: Drizzle ORM with PostgreSQL. Schema is in `shared/schema.ts`. Run `npm run db:push` to sync schema changes. Requires `DATABASE_URL` env var.
- The backend currently serves as a thin host for the Vite dev server and static assets in production. Most application logic runs client-side.

### File Server (`file-server/`)

- Entirely separate from the main app — its own `package.json`, runs on port 3000.
- Google Drive sync is **optional**: only activates when `credentials.json` and `token.json` are present.
- File uploads are stored in `file-server/public/uploads/` with UUID-prefixed names.
- `credentials.json` must be obtained from Google Cloud Console (OAuth 2.0 client). Run `npm run auth` once to generate `token.json`.

---

## Environment Variables

**Main app (Express + Vite):**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | For DB migrations | PostgreSQL connection string |
| `PORT` | No (default 5000) | Server port |
| `NODE_ENV` | No | `development` or `production` |

**Client (Vite, prefix with `VITE_`):**

| Variable | Required | Description |
|---|---|---|
| `VITE_WORKER_URL` | No | Cloudflare Worker URL. When set, inference is proxied through the Worker and no HF API key is needed in the browser. |

**Cloudflare Worker (set via `wrangler secret`):**

| Secret | Required | Description |
|---|---|---|
| `HF_API_KEY` | Yes | Hugging Face API token |

**File server only** (not env vars — file-based):
- `file-server/credentials.json` — Google Cloud OAuth 2.0 client credentials
- `file-server/token.json` — Generated by the OAuth flow; do not commit

---

## TypeScript Conventions

- Strict mode is enabled (`tsconfig.json`). Do not disable strict checks.
- Path aliases: `@/*` maps to `client/src/`, `@shared/*` maps to `shared/`.
- Shared types between client and server go in `shared/schema.ts`.
- Use Zod schemas derived from Drizzle for all insert/update validation (see `insertUserSchema` pattern).

---

## Build Output

Production build generates:
- `dist/public/` — Static client assets (served by Express)
- `dist/index.cjs` — Bundled server (CommonJS, run with `node dist/index.cjs`)

The esbuild config in `script/build.ts` marks Node built-ins and most `node_modules` as external.

---

## What Does Not Exist Yet

- **Tests**: No test suite is currently present. When adding tests, use Vitest (already compatible with the Vite setup).
- **Authentication**: The `users` table and Passport.js dependency exist but no auth routes or middleware are implemented.
- **Database queries**: `MemStorage` is the only implementation. A real database-backed storage class needs to be written in `server/storage.ts`.
- **Cloudflare Worker deployment**: The Worker code is written but not yet deployed. See the setup steps in the Cloudflare Worker section above.

---

## Common Pitfalls

- The HF API key is stored in `localStorage` via Zustand persistence — never log it server-side or include it in server routes.
- The `file-server/` is a completely separate process with its own dependencies. Changes there do not affect the main `npm run dev` process.
- Drizzle schema changes require running `npm run db:push` — there are no auto-migrations.
- When modifying `shared/schema.ts`, both client and server types update since both import from `@shared/schema`.
- Do not add Replit-specific plugins (`@replit/vite-plugin-*`) outside the `!isProduction` guard in `vite.config.ts`.
