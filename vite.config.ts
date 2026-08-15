import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Identifies which deployment is actually being served, so a stale Vercel
// deployment URL can be told apart from the current one at a glance.
const BUILD_ID = (
  process.env.VERCEL_GIT_COMMIT_SHA || 'local'
).slice(0, 7);

export default defineConfig(() => {
  return {
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
