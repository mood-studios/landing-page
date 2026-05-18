# Mood Studios — Landing & Online Booking

Marketing site and public booking flow for Mood Studios, matching the `mood_studios-main` design and powered by the `backend` API.

## Pages

| Page | URL |
|------|-----|
| Landing (packages, cart, login modal) | `/` |
| Customer dashboard | `/dashboard.html` (after login) |
| Checkout | `/checkout.html` (login required) |
| Success | `/success.html` |

## Quick start

1. Start the API (from `backend/`):

   ```bash
   npm run dev
   ```

2. Seed data if needed: `npm run seed`

3. Start the landing site:

   ```bash
   cd landing
   npm install
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173)

Vite proxies `/api` to `http://localhost:5000`.

## Test account

After seeding the backend:

- Email: `customer@moodstudios.test`
- Password: `Customer123!`

## Environment

Copy `.env.example` to `.env` and set `VITE_API_URL` only when not using the dev proxy (e.g. production build pointing at your hosted API).

Add `LANDING_URL=http://localhost:5173` to `backend/.env` for CORS.

Auth uses an **httpOnly session cookie** set by the API (`credentials: 'include'` on fetch). The landing site does not store tokens in `localStorage`. Cart data still uses `localStorage` only for the shopping cart.
