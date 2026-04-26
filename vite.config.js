import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Match server/index.js — the API_PORT env (default 3003) lets us dodge an
// orphan node holding the old 3001. Both processes read the same env so
// the proxy target and the server's listen port stay in lockstep.
const API_PORT = Number(process.env.API_PORT) || 3003;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // host: true binds to 0.0.0.0 and prints both Local and Network URLs.
    // Lets the user review from a phone / other device on the same LAN.
    host: true,
    proxy: {
      '/api': {
        // Loopback IPv4 literal — `localhost` resolves to ::1 on Windows
        // and triggers ERR_CONNECTION_RESET against an Express server that
        // only listens on IPv4.
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        // Generous proxy timeouts — Gemini calls can take 1–3 minutes on PDFs.
        timeout: 600_000,
        proxyTimeout: 600_000,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            console.error(`[vite-proxy] error on ${req.method} ${req.url}: ${err.code || ''} ${err.message}`);
          });
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log(`[vite-proxy] → ${req.method} ${req.url}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[vite-proxy] ← ${proxyRes.statusCode} ${req.method} ${req.url}`);
          });
        },
      }
    }
  }
})
