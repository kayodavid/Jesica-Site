import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'agende-sua-consulta': resolve(__dirname, 'agende-sua-consulta.html'),
        blog: resolve(__dirname, 'blog.html')
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