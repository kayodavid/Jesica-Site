// vite.config.js - CORRIGIDO
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        agendamento: 'agemdar.html', 
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});