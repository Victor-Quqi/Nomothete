import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Same precedence as server/env.ts, inlined: this file runs before the
        // server's module graph exists.
        target: `http://localhost:${process.env.NOMOTHETE_PORT ?? process.env.PORT ?? 5179}`,
        changeOrigin: true,
        // No proxyRes hook here. http-proxy emits that event before it copies
        // the upstream headers across, so touching the response there commits
        // Vite's default text/plain and the copy is skipped — which the browser
        // meets as "EventSource's response has a MIME type (text/plain) that is
        // not text/event-stream", and nothing on the canvas ever moves. The
        // stream is piped through unbuffered without any help.
      },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
})
