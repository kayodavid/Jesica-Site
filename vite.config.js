import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    host: true, // Listen on all local IPs (fixes some browser connection issues)
    allowedHosts: true,
    port: 5173
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sobre: resolve(__dirname, 'sobre.html'),
        blog: resolve(__dirname, 'blog.html'),
        agendarConsulta: resolve(__dirname, 'agendar-consulta.html'),
        areaPaciente: resolve(__dirname, 'area-do-paciente.html'),
        login: resolve(__dirname, 'login.html'),
        redefinirSenha: resolve(__dirname, 'redefinir-senha.html'),
        responderQuestionario: resolve(__dirname, 'responder-questionario.html'),
        admin: resolve(__dirname, 'admin.html'),
        calendario: resolve(__dirname, 'calendario.html'),
        paciente: resolve(__dirname, 'paciente.html'),
        ebooks: resolve(__dirname, 'ebooks.html'),
        videos: resolve(__dirname, 'videos.html'),
        acompanhamentoNutricional: resolve(__dirname, 'acompanhamento-nutricional.html'),
        calculadoras: resolve(__dirname, 'calculadoras.html'),
        analiseRotulos: resolve(__dirname, 'analise-rotulos.html'),
        espacoPaciente: resolve(__dirname, 'espaco-paciente.html'),
        adminEspacoPaciente: resolve(__dirname, 'admin-espaco-paciente.html')
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