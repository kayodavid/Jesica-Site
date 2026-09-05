-- =========================================================================
-- SCRIPT COMPLETO DE RESTAURAÇÃO E GERENCIAMENTO DE VÍDEOS EDUCATIVOS
-- Execute este script no SQL Editor do Supabase
-- =========================================================================

-- 1. Ativar todos os vídeos legítimos (Geral, Perda de Peso, Hipertrofia, etc.)
UPDATE public.educational_videos 
SET published = true 
WHERE LEFT(COALESCE(theme, ''), 2) != '__' 
  AND LEFT(COALESCE(theme, ''), 12) != 'Calculadoras';

-- 2. Desativar registros internos do sistema
UPDATE public.educational_videos 
SET published = false 
WHERE LEFT(COALESCE(theme, ''), 2) = '__' 
   OR LEFT(COALESCE(theme, ''), 12) = 'Calculadoras';

-- 3. Função app_list_videos (Listagem para Admin e Pacientes)
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
    RETURN QUERY 
      SELECT * FROM public.educational_videos 
      ORDER BY created_at DESC; 
  ELSE 
    RETURN QUERY 
      SELECT * FROM public.educational_videos 
      WHERE published = true 
        AND LEFT(COALESCE(theme, ''), 2) != '__' 
        AND LEFT(COALESCE(theme, ''), 12) != 'Calculadoras'
      ORDER BY created_at DESC; 
  END IF; 
END; 
$$;

-- 4. Função app_add_video (Criação de novos vídeos)
DROP FUNCTION IF EXISTS public.app_add_video(text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.app_add_video;

CREATE OR REPLACE FUNCTION public.app_add_video(
  p_token text,
  p_title text,
  p_theme text,
  p_description text,
  p_url text,
  p_provider text,
  p_embed_url text,
  p_thumbnail_url text
)
RETURNS public.educational_videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_internal boolean;
  v_new_record public.educational_videos;
BEGIN
  v_is_internal := (
    LEFT(COALESCE(p_theme, ''), 2) = '__' 
    OR LEFT(COALESCE(p_theme, ''), 12) = 'Calculadoras' 
    OR (p_embed_url LIKE '%://%' AND p_embed_url NOT LIKE 'http%')
  );
  
  INSERT INTO public.educational_videos (
    title,
    theme,
    description,
    url,
    provider,
    embed_url,
    thumbnail_url,
    published,
    created_at,
    updated_at
  ) VALUES (
    p_title,
    p_theme,
    p_description,
    p_url,
    p_provider,
    p_embed_url,
    p_thumbnail_url,
    NOT v_is_internal,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_new_record;
  
  RETURN v_new_record;
END;
$$;

-- 5. Função app_update_video (Edição de vídeos)
DROP FUNCTION IF EXISTS public.app_update_video(text, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.app_update_video(text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.app_update_video;

CREATE OR REPLACE FUNCTION public.app_update_video(
  p_token text,
  p_id text,
  p_title text,
  p_theme text,
  p_description text,
  p_url text,
  p_provider text,
  p_embed_url text,
  p_thumbnail_url text
)
RETURNS public.educational_videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_record public.educational_videos;
BEGIN
  UPDATE public.educational_videos
  SET 
    title = p_title,
    theme = p_theme,
    description = p_description,
    url = p_url,
    provider = p_provider,
    embed_url = p_embed_url,
    thumbnail_url = p_thumbnail_url,
    updated_at = NOW()
  WHERE id::text = p_id
  RETURNING * INTO v_updated_record;
  
  RETURN v_updated_record;
END;
$$;

-- 6. Função app_delete_video (Exclusão de vídeos)
DROP FUNCTION IF EXISTS public.app_delete_video(text, uuid);
DROP FUNCTION IF EXISTS public.app_delete_video(text, text);
DROP FUNCTION IF EXISTS public.app_delete_video;

CREATE OR REPLACE FUNCTION public.app_delete_video(
  p_token text,
  p_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.educational_videos WHERE id::text = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_list_videos(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_add_video(text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_video(text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_video(text, text) TO anon, authenticated;
