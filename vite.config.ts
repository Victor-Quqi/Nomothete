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
        // Server-sent events must not be buffered on the way through.
        configure: proxy => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              res.flushHeaders?.()
            }
          })
        },
      },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
})
