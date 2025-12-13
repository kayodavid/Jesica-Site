import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        agendamento: resolve(__dirname, 'agendamento.html')
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