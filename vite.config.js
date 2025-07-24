import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        details: 'movie-details.html',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});