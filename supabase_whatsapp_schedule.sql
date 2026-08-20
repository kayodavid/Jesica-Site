-- Agendamento da automação oficial de WhatsApp
-- Execute SOMENTE depois de:
-- 1) executar supabase_whatsapp_automation.sql;
-- 2) publicar a função /api/whatsapp/dispatch no site;
-- 3) cadastrar as variáveis seguras WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
--    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET na hospedagem;
-- 4) substituir os dois valores abaixo antes de executar.
--
-- A rotina é chamada a cada 15 minutos. Ela não envia nada enquanto as configurações
-- do painel estiverem desativadas e só processa as regras cujo horário coincide com o momento atual.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Substitua os valores pelos dados reais antes de executar.
select vault.create_secret(
  'https://jessicamelonutri.com.br/api/whatsapp/dispatch',
  'whatsapp_dispatch_url',
  'URL da rotina protegida de WhatsApp'
);

select vault.create_secret(
  'SUBSTITUA_PELO_MESMO_VALOR_DE_CRON_SECRET_CADASTRADO_NA_HOSPEDAGEM',
  'whatsapp_dispatch_cron_secret',
  'Segredo para autenticar o agendamento do WhatsApp'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'jessica-whatsapp-dispatch';

select cron.schedule(
  'jessica-whatsapp-dispatch',
  '*/15 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_dispatch_url'),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_dispatch_cron_secret')
      )
    );
  $$
);

-- Verificação opcional do agendamento criado:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'jessica-whatsapp-dispatch';
