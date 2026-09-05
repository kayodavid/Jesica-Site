-- =========================================================================
-- SCRIPT DE LIMPEZA E PROTEÇÃO DA BIBLIOTECA DE VÍDEOS EDUCATIVOS
-- Execute este script no SQL Editor do Supabase para:
-- 1. Excluir os registros de questionários/cliques que entraram como vídeos
-- 2. Garantir que o paciente só visualize vídeos reais (Geral, Perda de Peso, etc.)
-- =========================================================================

-- 1. Deletar todos os registros de rastreamento de questionários da tabela de vídeos
DELETE FROM public.educational_videos 
WHERE theme IN (
  '__email_quiz_click__', 
  '__email_quiz_progress__', 
  '__email_quiz_invitation__', 
  '__email_quiz_response__', 
  '__email_quiz_schedule__'
)
OR embed_url LIKE 'email-quiz-%';

-- 2. Garantir que outros registros do sistema interno fiquem como published = false
UPDATE public.educational_videos 
SET published = false 
WHERE theme LIKE '\_\_%' 
   OR theme LIKE 'Calculadoras%' 
   OR embed_url LIKE 'quiz://%' 
   OR embed_url LIKE 'question://%' 
   OR embed_url LIKE 'patient-%' 
   OR embed_url LIKE 'financial-%' 
   OR embed_url LIKE 'reminder%' 
   OR embed_url LIKE 'service://%'
   OR embed_url LIKE 'platform-preferences://%';

-- 3. Atualizar a função app_list_videos para que o perfil 'patient' NUNCA receba temas de sistema
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
  ELSIF r = 'patient' THEN 
    RETURN QUERY 
      SELECT * FROM public.educational_videos 
      WHERE published = true 
        AND theme NOT LIKE '\_\_%' 
        AND theme NOT LIKE 'Calculadoras%'
        AND (embed_url LIKE 'http%' OR embed_url LIKE 'https%' OR provider IN ('youtube', 'vimeo'))
      ORDER BY created_at DESC; 
  END IF; 
END; 
$$;

-- 4. Atualizar a função app_add_video para que inserções internas nunca fiquem publicadas
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
    p_theme LIKE '\_\_%' 
    OR p_theme LIKE 'Calculadoras%' 
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

GRANT EXECUTE ON FUNCTION public.app_list_videos(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_add_video(text, text, text, text, text, text, text, text) TO anon, authenticated;
