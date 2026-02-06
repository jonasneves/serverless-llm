import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react({ tsDecorators: true })],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('katex')) {
              return 'math-render';
            }
            if (id.includes('highlight.js')) {
              return 'syntax-highlight';
            }
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
              return 'markdown';
            }
            if (id.includes('@mediapipe')) {
              return 'mediapipe';
            }
          }
        },
      },
    },
  },
  // GitHub Pages deployment uses VITE_BASE env var (e.g., / for custom domain)
  base: command === 'serve' ? '/' : (process.env.VITE_BASE || '/'),
}))
