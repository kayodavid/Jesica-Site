# MVP — Cadastro automático de vídeos

## Implementação

O painel administrativo agora possui uma seção "Vídeos educativos" com campos para título, link e descrição. O sistema identifica automaticamente links do YouTube e do Vimeo, converte o endereço para o player incorporado correspondente e publica o conteúdo imediatamente para os pacientes.

A página de vídeos deixou de usar um vídeo fixo e passou a renderizar dinamicamente todos os vídeos publicados. O administrador também pode excluir vídeos cadastrados.

## Validação

O build do Vite foi concluído com sucesso e as rotas `admin`, `videos` e `paciente` foram geradas. O teste automatizado confirmou que links do YouTube geram `https://www.youtube.com/embed/{id}`, links do Vimeo geram `https://player.vimeo.com/video/{id}`, e domínios não permitidos são rejeitados.

O preview publicado é um projeto separado na Vercel. O acesso temporário ao preview expira em 17/08/2026 às 20:50:49, conforme o link gerado pela Vercel.

## Limitação do MVP

A persistência continua baseada em `localStorage`, portanto o cadastro feito pelo administrador só é compartilhado com pacientes que utilizem o mesmo navegador/origem no ambiente de teste. Para operação real entre dispositivos, será necessário substituir essa camada por backend, banco de dados e autenticação no servidor.
