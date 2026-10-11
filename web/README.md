# Orabl Web

The session based learning workspace for Orabl, Orabl.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- shadcn/ui-style primitives with Radix-compatible structure
- Zod + React Hook Form
- TanStack Query
- React Router
- Lucide icons
- Sonner notifications
- Bun

## Run locally

```bash
bun install
cp .env.example .env
bun run dev
```

The frontend expects the API at `http://localhost:8000/v1` by default. Set `VITE_API_BASE_URL` in `.env` to point to another environment.

Apply backend migration `007_study_sessions` before opening the dashboard. Signed in users start at `/`, create a session, and continue through `/sessions/:id/upload`, `goal`, `preparing`, `practice`, and `results`. Upload and goal drafts, materials, and practice progress are saved on the server.

## Available scripts

```bash
bun run dev       # Start Vite development server
bun run build     # Typecheck and build for production
bun run lint      # Run Oxlint
bun run preview   # Preview the production build
```
