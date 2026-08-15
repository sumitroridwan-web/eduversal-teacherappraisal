<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8273535e-1980-4c48-b860-4f3173597b5a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env` and fill in:
   - `GEMINI_API_KEY` — your Gemini API key
   - `APP_PASSWORD` — the password required to open the platform
   - `APP_SESSION_SECRET` — optional; `openssl rand -hex 32`
3. Run the app:
   `npm run dev`

## Access Password

The platform is gated behind a shared password held in the `APP_PASSWORD`
environment variable. It is verified on the server and is never included in
the browser bundle.

- **The gate is closed until `APP_PASSWORD` is set.** With no value, the login
  screen reports that access is not configured and nobody can sign in.
- A successful login sets an httpOnly session cookie valid for 12 hours.
- Set `APP_SESSION_SECRET` to keep sessions alive across server restarts;
  without it a new signing key is generated each boot and everyone is signed out.
- Failed logins are throttled to 10 per IP per 15 minutes.
- The AI endpoints (`/api/analyze-lesson`, `/api/ai-feedback`, `/api/auto-grade`)
  reject unauthenticated requests, so the Gemini key cannot be used by outsiders.
- The lock button in the top bar ends the session.

When deploying, set `APP_PASSWORD` in the hosting environment's secrets —
never commit it, as this repository is public.
