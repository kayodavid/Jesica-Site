-- =========================================================================
-- SCRIPT CORRETIVO PARA REATIVAR TODOS OS VÍDEOS EDUCATIVOS
-- Execute este script no SQL Editor do Supabase
-- =========================================================================

-- 1. Ativar (published = true) todos os vídeos legítimos (Geral, Perda de Peso, Hipertrofia, etc.)
UPDATE public.educational_videos 
SET published = true 
WHERE LEFT(COALESCE(theme, ''), 2) != '__' 
  AND LEFT(COALESCE(theme, ''), 12) != 'Calculadoras';

-- 2. Garantir que registros internos fiquem despublicados (published = false)
UPDATE public.educational_videos 
SET published = false 
WHERE LEFT(COALESCE(theme, ''), 2) = '__' 
   OR LEFT(COALESCE(theme, ''), 12) = 'Calculadoras';

-- 3. Dropar e recriar a função app_list_videos usando LEFT() para não conflitar com wildcard SQL
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
        AND LEFT(COALESCE(theme, ''), 2) != '__' 
        AND LEFT(COALESCE(theme, ''), 12) != 'Calculadoras'
      ORDER BY created_at DESC; 
  END IF; 
END; 
$$;

GRANT EXECUTE ON FUNCTION public.app_list_videos(text) TO anon, authenticated;
