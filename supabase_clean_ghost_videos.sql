-- =========================================================================
-- SCRIPT DE RESTAURAÇÃO E EXIBIÇÃO DOS VÍDEOS EDUCATIVOS
-- Execute este script no SQL Editor do Supabase para:
-- 1. Ativar (published = true) todos os vídeos legítimos (Geral, Perda de Peso, Hipertrofia, etc.)
-- 2. Garantir que a função app_list_videos entregue os vídeos tanto para admin quanto para pacientes
-- =========================================================================

-- 1. Ativar todos os vídeos educativos legítimos cadastrados pelo administrador
UPDATE public.educational_videos 
SET published = true 
WHERE theme NOT LIKE '\_\_%' 
  AND theme NOT LIKE 'Calculadoras%';

-- 2. Dropar e recriar a função app_list_videos sem restrições excessivas
DROP FUNCTION IF EXISTS public.app_list_videos(text);

CREATE OR REPLACE FUNCTION public.app_list_videos(p_token text)
RETURNS SETOF public.educational_videos 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$ 
DECLARE 
  r text; 
BEGIN 
  SELECT role INTO r FROM public.app_current_user(p_token); 
  
  IF r = 'admin' THEN 
    RETURN QUERY 
      SELECT * FROM public.educational_videos 
      ORDER BY created_at DESC; 
  ELSE 
    -- Pacientes ou visualização autenticada: retorna os vídeos publicados reais
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
