-- =========================================================================
-- SCRIPT DEFINITIVO PARA RESTAURAR E EXIBIR OS VÍDEOS EDUCATIVOS
-- Execute no SQL Editor do Supabase
-- =========================================================================

-- 1. Ativar todos os vídeos educativos reais (Geral, Perda de Peso, Hipertrofia, etc.)
UPDATE public.educational_videos 
SET published = true 
WHERE theme NOT LIKE '\_\_%' 
  AND theme NOT LIKE 'Calculadoras%';

-- 2. Dropar e recriar a função app_list_videos garantindo retorno para pacientes e público
DROP FUNCTION IF EXISTS public.app_list_videos(text);
DROP FUNCTION IF EXISTS public.app_list_videos();

CREATE OR REPLACE FUNCTION public.app_list_videos(p_token text DEFAULT NULL)
RETURNS SETOF public.educational_videos 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$ 
DECLARE 
  r text; 
BEGIN 
  IF p_token IS NOT NULL AND p_token != '' THEN
    SELECT role INTO r FROM public.app_current_user(p_token); 
  END IF;
  
  IF r = 'admin' THEN 
    -- Administrador vê tudo para gerenciamento
    RETURN QUERY 
      SELECT * FROM public.educational_videos 
      ORDER BY created_at DESC; 
  ELSE 
    -- Paciente ou visualização padrão: sempre entrega todos os vídeos educativos publicados
    RETURN QUERY 
      SELECT * FROM public.educational_videos 
      WHERE published = true 
        AND theme NOT LIKE '\_\_%' 
        AND theme NOT LIKE 'Calculadoras%'
      ORDER BY created_at DESC; 
  END IF; 
END; 
$$;

GRANT EXECUTE ON FUNCTION public.app_list_videos(text) TO anon, authenticated;
