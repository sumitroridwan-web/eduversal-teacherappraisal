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

## Multi-device sync (Firestore)

Records live in the browser by default. Setting the three `FIREBASE_*`
variables turns on sync, so one shared account can be used from several
devices during an appraisal period.

1. Create a Firebase project, then create a **Firestore database in
   `asia-southeast2` (Jakarta)**. The region is fixed at creation.
2. **Project settings → Service accounts → Generate new private key**, and put
   `project_id`, `client_email` and `private_key` into the environment
   variables above.
3. Lock the database down. All access goes through this API, which is already
   behind the platform password, so no browser ever needs direct access:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} { allow read, write: if false; }
     }
   }
   ```

   The service account bypasses these rules; anyone else is refused.

How it behaves:

- Writes go to the browser first and are pushed up afterwards, so a lost
  connection mid-observation cannot cost the lesson. Queued writes retry
  automatically and on reconnect.
- Other devices' changes are pulled on load and every 60 seconds.
- If the same record was changed on two devices, the second write is refused
  and the appraiser is asked which version to keep. Nothing is overwritten
  silently.
- Firestore allows about 1 MB per record and photos are stored inside it, so a
  photo-heavy observation can be rejected with a clear message. Moving photos
  to Cloud Storage is the fix if that becomes common.

## Deploying to Vercel

The frontend is served from `dist/` by Vercel's CDN and the API runs as a
serverless function ([api/index.ts](api/index.ts), which re-exports the Express
app in [app.ts](app.ts)). [vercel.json](vercel.json) rewrites `/api/*` to the
function and everything else to the SPA.

Set these in **Project → Settings → Environment Variables**, then redeploy:

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_PASSWORD` | Yes | Nobody can sign in until this is set. |
| `APP_SESSION_SECRET` | Yes | On serverless each instance would otherwise generate its own signing key, so sessions break at random. `openssl rand -hex 32` |
| `GEMINI_API_KEY` | For AI features | The AI endpoints return an error without it. |

Note that `npm start` / [server.ts](server.ts) is only for local and
self-hosted use; Vercel never runs it.
