/**
 * Local / self-hosted entrypoint.
 *
 * Serves the API from app.ts alongside the frontend: Vite middleware in
 * development, the built dist/ folder in production. Vercel does not use this
 * file - it runs api/index.ts as a serverless function and serves dist/ from
 * its CDN instead.
 */
import "dotenv/config";
import express from "express";
import path from "path";
import app from "./app";

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Imported lazily so the dev-only dependency never reaches a production bundle.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Eduversal Appraisal Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
