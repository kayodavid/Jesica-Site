# MVP — Vídeos por temas

## Funcionalidades

O cadastro administrativo agora solicita título, tema, link do vídeo e descrição. O tema é salvo junto ao vídeo e conteúdos antigos sem tema são apresentados como "Geral".

No painel administrativo, cada conteúdo aparece em um card com prévia incorporada, título, plataforma, tema, descrição, link original e ação de exclusão.

Na área do paciente, os conteúdos publicados são agrupados por tema e apresentados em abas. Cada aba exibe os cards dos vídeos daquele tema, com título, descrição, player e identificação da plataforma.

## Validação

O build do Vite foi concluído com sucesso. O preview foi publicado na Vercel com deployment `dpl_8siCFhmnCce4yAy5URLp8eqwPCJ6` em estado `READY`. O painel administrativo carregou os campos `Título`, `Tema`, `Link do vídeo` e `Descrição`, e a listagem passou a exibir o tema `Geral` no conteúdo existente.

O link temporário de teste é válido até 17/08/2026 às 21:01:39.

## Limitação

A persistência continua em `localStorage` no MVP. Para uso real entre dispositivos, os vídeos e temas devem migrar para backend e banco de dados compartilhado.
