# Orabl Web

The user-facing learning workspace for Orabl, the Adaptive Oral Learning Platform.

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

## Available scripts

```bash
bun run dev       # Start Vite development server
bun run build     # Typecheck and build for production
bun run lint      # Run Oxlint
bun run preview   # Preview the production build
```

## Current sprint

Sprint 1 provides the product foundation and the first user journey:

- Welcome screen
- Material upload with text and PDF support
- Goal creation form
- Question preparation screen
- Responsive black-and-white application shell
- API health indicator
- Typed API client for `/v1` endpoints
- Zod validation and accessible form states
