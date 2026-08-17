# Validação do MVP de vídeo

- Build Vite concluído com sucesso em 16/08/2026.
- O servidor local foi exposto em uma URL temporária para teste.
- A tela de login carregou normalmente.
- Login de teste com `paciente@exemplo.com` e senha `123` foi aceito.
- Após o login, a página do calendário exibiu a seção `Conteúdo educativo` / `Vídeo educativo`.
- O vídeo incorporado usa o ID `wvIuRQbTQVM` e o endereço `https://www.youtube.com/embed/wvIuRQbTQVM`.
- A seção foi programada para aparecer apenas quando a sessão tem papel `patient`; no modo de visualização administrativa, ela permanece oculta.
- Esta implementação é um MVP de front-end: a autorização ainda depende da sessão local do navegador e o vídeo não listado continua podendo ser compartilhado por quem obtiver o link.
