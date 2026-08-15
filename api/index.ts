/**
 * Vercel serverless entrypoint.
 *
 * vercel.json rewrites every /api/* request here and Express matches on the
 * original path (e.g. /api/auth/login) exactly as it does locally. A
 * [...path] catch-all was tried instead, but Vercel matched it only against
 * single-segment paths, so /api/auth/session returned a platform 404.
 *
 * The app is imported lazily inside a try/catch: if it fails to initialise,
 * Vercel would otherwise answer with an opaque FUNCTION_INVOCATION_FAILED and
 * the reason would only be visible in the dashboard logs. Reporting it as JSON
 * lets the sign-in screen show what actually went wrong.
 */
import type { IncomingMessage, ServerResponse } from "http";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  let app: any;
  try {
    // Explicit .js extension: Vercel compiles this function to ESM, where Node
    // will not resolve an extensionless relative import at runtime.
    app = (await import("../app.js")).default;
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "The API failed to start.",
        detail: error?.message || String(error),
        where: String(error?.stack || "").split("\n").slice(1, 4),
      })
    );
    return;
  }

  return app(req, res);
}
