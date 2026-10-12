# Phantix Staff Portal

The internal console for Phantix staff. Admins manage client organizations, the
sandbox cohort and the waitlist; editors publish The SecureGraph Weekly;
contributors work on the knowledge, skills and engines; superadmins run the
platform itself (Overwatch, terminal, billing, staff accounts).

| | |
| --- | --- |
| **Live** | https://staff.phantixlabs.com |
| **Users** | Phantix staff only, by role: contributor, editor, admin, superadmin |
| **Part of** | `Phantix-Labs-Ltd/phantix-staff` (its own repository) |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS, React Router 6 |
| **Local** | http://localhost:5175 (`npm run dev`) |
| **Deploys to** | Vercel, on push to `main` |

## What it does

Each route is guarded by the lowest role that may open it (`src/App.tsx`).

| Role | Routes |
| --- | --- |
| Any staff | `/dashboard`, `/support`, `/search` |
| Contributor | `/contribute` and `/contribute/knowledge`, `/skills`, `/capabilities`, `/engines`, `/learning`; `/architecture` |
| Editor | `/weekly`: write, import (`.md`), publish and unpublish blog posts |
| Admin | Clients: `/clients`, `/clients/:id`, `/sandbox`, `/waitlist`, `/demo-requests`, `/feedback` |
| Admin | Operations: `/logs`, `/server`, `/services`, `/scanner-tools`, `/bus`, `/analytics`, `/audits` |
| Admin | Product: `/compliance`, `/soc-provisioning`, `/email-templates`, `/legal-documents`, `/tooling`, `/discovery`, `/experience`, `/ai`, `/agent-activity`, `/vapt-admin` |
| AGI admin | `/agi`: pentest agent administration |
| Superadmin | `/overwatch`, `/terminal`, `/super-logs`, `/engine-jobs`, `/billing`, `/staff`, `/internal-alerts` |

- **Sandbox and waitlist.** `/sandbox` manages the beta cohort (make active,
  pause, conclude); concluding it reopens registration. `/waitlist` lists the
  work emails collected while registration is closed, with their Quick Scan status.
- **Terminal.** `/terminal` opens a WebSocket straight to the backend, because
  Vercel rewrites cannot carry WebSockets.

## How it fits

- **Staff realm.** Sign-in is `POST /api/v1/staff/login` (staff JWT), separate
  from customer sign-in. Pages call `/api/v1/staff/*` and `/api/v1/admin/*`.
- **API.** Calls `/api` on its own origin; Vercel rewrites `/api/*` and
  `/sandbox-apply/*` to the backend.
- **Feeds other apps.** Posts published at `/weekly` appear on the blog. Legal
  documents and email templates edited here are the versions the backend serves and sends.

## Run it locally

Prerequisites: Node 20 and npm.

```bash
npm install
npm run dev               # http://localhost:5175
```

Attack's dev server also uses 5175. To run both, start this one on another port:
`npx vite --port 5179 --strictPort`. The dev server proxies `/api` (WebSockets
included) to `https://staging.phantix.site`; set `API_PROXY_TARGET` for a local
backend.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Dev proxy target for `/api`. Server-side only. |
| `DEV_PORT` | `5176` | Port when `vite` runs without the npm script (the npm script passes 5175). |
| `VITE_TERMINAL_WS_ORIGIN` | unset (uses the dev proxy) | Backend WebSocket origin for `/terminal` in production, for example `wss://staging.phantix.site`. |

Browser config is hard-coded in `src/lib/config.ts`.

## Project layout

```
src/
  App.tsx           Routes and the role guards (RequireStaff … RequireSuperadmin)
  pages/            Login and password pages, Dashboard
  pages/admin/      One page per admin area (Clients, Sandbox, Waitlist, Weekly, Overwatch …)
  pages/contribute/ The contributor workspace
  components/       Layout, command palette, AGI console, Overwatch map
  lib/              API client, store, config, Overwatch topology, AGI helpers
public/             Brand assets; falls back to the monorepo's public/ when absent
vercel.json         /api and /sandbox-apply rewrites, SPA fallback
```

## Checks

```bash
npm run typecheck
npm run build
```

There is no CI workflow in this repository and no unit test suite; run both
checks before opening a pull request.

## Deploy

Vercel builds the repository with `npm run build` into `dist` and deploys
production on push to `main`; other branches get previews.

## Related

- Phantix-Frontend: `docs/README-STANDARD.md`, and the blog that `/weekly` publishes to
- Phantix_Backend: `docs/08-frontend/portals/04-staff-admin.md` (staff API contract)
