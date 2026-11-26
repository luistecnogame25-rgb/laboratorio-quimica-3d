import { defineConfig } from 'vite';

// Rutas relativas para que el mismo build funcione en el navegador y dentro del WebView de Capacitor.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
