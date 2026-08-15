/**
 * Vercel serverless entrypoint.
 *
 * vercel.json rewrites every /api/* request here, and the Express app matches
 * on the original path (e.g. /api/auth/login) exactly as it does locally.
 */
import app from "../app";

export default app;
