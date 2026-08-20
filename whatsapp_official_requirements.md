# Requisitos oficiais — Automação por WhatsApp

Consultado em 20 de agosto de 2026.

| Assunto | Achado relevante | Fonte oficial |
|---|---|---|
| API oficial | A WhatsApp Business Platform Cloud API permite enviar e receber mensagens empresariais. | https://developers.facebook.com/documentation/business-messaging/whatsapp/overview |
| Cobrança | A Meta cobra por mensagem entregue, com valor definido pela categoria do modelo e pelo país do destinatário. Mensagens de utilidade respondidas dentro de uma janela de atendimento aberta eram isentas nas regras atuais; há atualização anunciada para outubro de 2026. | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing |
| Consentimento | A empresa deve ter o número e consentimento do destinatário antes de iniciar mensagens; deve oferecer e respeitar a interrupção dos avisos. | https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in ; https://whatsappbusiness.com/policy/ |
| Modelos | Iniciativas empresariais fora da janela de 24 horas exigem modelos aprovados; o conteúdo deve corresponder à categoria aprovada. | https://whatsappbusiness.com/policy/ |
| Número novo | A integração direta não cobra aluguel de número; um novo número é fornecido pela operadora via chip/eSIM. |
| Número atual | A Meta documenta modo de coexistência entre WhatsApp Business e Cloud API para contas elegíveis, mantendo uso 1:1 do aplicativo e sincronização de histórico. Para este projeto foi decidido usar um novo número exclusivo. | https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users |
| Agendamento econômico | Supabase Cron, baseado em pg_cron, pode disparar funções em periodicidade definida e registrar as execuções. | https://supabase.com/docs/guides/cron ; https://supabase.com/docs/guides/functions/schedule-functions |
| Hospedagem atual | Vercel Hobby suporta rotinas apenas uma vez ao dia, com precisão horária; execução mais frequente exige plano Pro. | https://vercel.com/docs/cron-jobs/usage-and-pricing |

## Diretriz adotada

A primeira versão usará um novo número profissional exclusivo, consentimento explícito individual, modelos de utilidade aprovados e uma rotina diária para identificar mensagens programadas. Dados clínicos sensíveis não devem ser enviados pelo WhatsApp; a mensagem deve direcionar a pessoa para a área logada quando houver necessidade de detalhe.
