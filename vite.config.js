import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    host: true, // Listen on all local IPs (fixes some browser connection issues)
    port: 5173
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sobre: resolve(__dirname, 'sobre.html'),
        'agendar-consulta': resolve(__dirname, 'agendar-consulta.html'),
        blog: resolve(__dirname, 'blog.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'admin.html'),
        calendario: resolve(__dirname, 'calendario.html')
      },
      output: {
        // Gera arquivos em pastas separadas para URLs limpas
        entryFileNames: '[name]/index.js',
        chunkFileNames: '[name]/[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  },
  // Configuração para preview local com URLs limpas
  preview: {
    port: 3000,
    strictPort: false,
  }
})