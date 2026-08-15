/**
 * Vercel serverless entrypoint.
 *
 * The [...path] catch-all means Vercel's own filesystem routing sends every
 * /api/* request here - no rewrite rule required - and Express matches on the
 * original path (e.g. /api/auth/login) exactly as it does locally.
 */
import app from "../app";

export default app;
