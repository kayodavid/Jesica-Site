# Validação da migração de Calculadoras do Paciente

**Data:** 18 de agosto de 2026

A migração `supabase_patient_calculators.sql` foi executada no projeto Supabase `mcsilxhgwbxtvydytjcx` após confirmação explícita do usuário. O editor SQL retornou **“Success. No rows returned”**.

A migração criou a tabela `public.patient_calculators`, o índice de publicação, as funções RPC de listagem, criação, atualização e exclusão, e as permissões de execução correspondentes. Nenhuma tabela de pacientes, vídeos, eBooks, blogs ou calendários foi alterada.

## Diagnóstico posterior

A consulta direta à tabela confirmou que não há registros persistidos em `patient_calculators`. Uma chamada ao proxy publicado para `app_list_patient_calculators` retornou `PGRST202`, indicando que o PostgREST ainda não reconhece a função no cache de esquema. Foi emitido `NOTIFY pgrst, 'reload schema';`, porém a primeira nova tentativa continuou retornando `PGRST202`; é necessário revisar a exposição das funções no banco.

A função de listagem `app_list_patient_calculators` foi reaplicada diretamente no editor SQL, com `row_security = off`, concessão de execução para `anon` e `authenticated`, e nova notificação de recarga do esquema. O editor retornou sucesso; a validação da exposição via RPC permanece pendente.

Uma versão SQL simplificada de `app_list_patient_calculators` também foi executada com sucesso no editor. Apesar disso, é necessário confirmar novamente o catálogo e a disponibilidade via proxy, pois as tentativas anteriores não refletiram a função no PostgREST.

O editor SQL parece executar apenas a primeira instrução do bloco em determinadas tentativas, pois consultas encadeadas não exibiram o resultado final esperado. A próxima verificação compara o catálogo de funções com uma RPC preexistente para confirmar esse comportamento antes de aplicar uma alternativa de integração.

As consultas ao catálogo executadas pelo editor retornaram zero linhas inclusive para `app_list_videos`, indicando que a visualização de resultados do editor pode não refletir funções como esperado. Será feita uma chamada SQL direta à nova função para distinguir entre ausência da função e cache do PostgREST.

## Referência de diagnóstico

A documentação da Supabase orienta a recarga do cache do PostgREST com `NOTIFY pgrst, 'reload schema';`. A própria documentação também registra que, em casos raros, uma fila de notificações pode impedir a atualização do cache após alterações de esquema. Fontes: [Refresh PostgREST Schema](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema) e [PostgREST Not Recognizing New Tables or Functions](https://supabase.com/docs/guides/troubleshooting/postgrest-not-recognizing-new-columns-or-functions-bd75f5).

## Alternativa de compatibilidade aplicada

Como a API do projeto não atualizou seu cache para novos objetos, a persistência de calculadoras foi adaptada para usar as rotinas de vídeos já reconhecidas pela API, com marcadores internos que as removem completamente da biblioteca de vídeos. Uma calculadora de IMC foi inserida com sucesso como registro marcado para calculadora, sem criar duplicatas.

A validação imediata do registro marcado como calculadora retornou zero linhas apesar de o editor indicar sucesso no comando condicional. Para eliminar ambiguidade de execução, a próxima tentativa usará uma inserção única com `RETURNING`, permitindo confirmar visualmente a linha gravada.
