/**
 * API base URL.
 *
 * Dev  (no VITE_API_URL set): defaults to '/api', which the Vite dev-server
 *   proxy rewrites to http://localhost:3000 — no CORS, no extra config.
 *
 * Prod (VITE_API_URL set):    use the Railway backend URL, e.g.
 *   VITE_API_URL=https://modelrouter-backend.up.railway.app
 *   Fetch calls become: https://…railway.app/route, /metrics, etc.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
