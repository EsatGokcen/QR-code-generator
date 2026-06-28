import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration for the React client.
 *
 * The proxy block is the key piece: any request from the browser to /api/*
 * is transparently forwarded to the Express server on port 3001.
 *
 * WHY A PROXY?
 * In development, the browser makes requests to http://localhost:5173/api/register.
 * Without a proxy, that request would hit the Vite dev server (which knows nothing
 * about /api) and return a 404. With the proxy, Vite intercepts /api requests and
 * forwards them to http://localhost:3001/api/register — our Express server.
 *
 * This also sidesteps CORS entirely in development: the browser sees one origin
 * (localhost:5173) for all requests, so no preflight OPTIONS requests are needed.
 * In production, your reverse proxy (Nginx/Caddy/AWS ALB) does the same job.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
