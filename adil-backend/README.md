# Adil Furnitures — Backend API (Node + Express + MongoDB + Cloudinary)

API only. The website and the admin panel are separate projects that call this API over HTTPS.

## Run locally
```
npm install
cp .env.example .env     # fill values
npm run dev              # http://localhost:10000
```
## Environment variables
| Name | What |
|---|---|
| MONGODB_URI | MongoDB Atlas connection string |
| CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET | Cloudinary credentials |
| ADMIN_LOGIN_CODE | admin login code (server-only, set it in Render) |
| JWT_SECRET | long random string |
| CORS_ORIGIN | **website URL and admin URL**, comma separated, no trailing slash, e.g. `https://shop.example.com,https://admin.example.com` |
| FRONTEND_URL | website URL (used by "View website" links in admin) |
| WHATSAPP_NUMBER | first-run default (edit later in Admin > Settings) |
| NODE_ENV, PORT | `production`, `10000` |
| SEED_ON_EMPTY | `true` (default): imports demo catalogue into an empty DB |

## Deploy on Render
New > Web Service > this repo. Build `npm install`, Start `npm start`, Health check `/api/health`. Add the env vars.
Admin auth: `POST /api/admin/login {code}` returns a 12 h bearer token (`Authorization: Bearer …`); sessions are stored in MongoDB so logout revokes them. Login is rate-limited with lockout.

## Endpoints
Public: `GET /api/health`, `/api/public/catalog`, `/api/public/version`; `POST /api/track/{visit,event,cart,profile,whatsapp}`, `/api/lead`, `/api/enquiry`, `/api/bulk-enquiry`.
Admin (bearer token): `/api/admin/{me,stats,live,visitors,carts,whatsapp,enquiries,leads,products,categories,settings,export/:type}` plus create/update/delete routes.

## Notes
- `npm run seed` imports `server/data/catalog.json` as demo products (`isDemo`).
- Render Free sleeps after ~15 min idle (30-60 s cold start). `warmUntil` in `/api/health` is an app-level marker only.
- Not run against live MongoDB/Cloudinary in the build sandbox - test after first deploy.
