BEGIN;

ALTER TABLE public.educational_videos DROP CONSTRAINT IF EXISTS educational_videos_provider_check;
ALTER TABLE public.educational_videos ADD CONSTRAINT educational_videos_provider_check CHECK (provider IN ('youtube', 'vimeo', 'google_drive'));

CREATE TABLE IF NOT EXISTS public.educational_ebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  theme text NOT NULL DEFAULT 'Geral',
  description text NOT NULL DEFAULT '',
  url text NOT NULL,
  provider text NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
  embed_url text NOT NULL,
  thumbnail_url text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ebooks_published_idx ON public.educational_ebooks(published);
ALTER TABLE public.educational_ebooks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.app_list_ebooks(p_token text)
RETURNS SETOF public.educational_ebooks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM public.app_current_user(p_token);
  IF r = 'admin' THEN
    RETURN QUERY SELECT * FROM public.educational_ebooks ORDER BY created_at DESC;
  ELSIF r = 'patient' THEN
    RETURN QUERY SELECT * FROM public.educational_ebooks WHERE published ORDER BY created_at DESC;
  END IF;
END;
$f$;

CREATE OR REPLACE FUNCTION public.app_add_ebook(p_token text, p_title text, p_theme text, p_description text, p_url text, p_embed_url text, p_thumbnail_url text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_current_user(p_token) WHERE role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  END IF;
  INSERT INTO public.educational_ebooks(title, theme, description, url, embed_url, thumbnail_url)
  VALUES (trim(p_title), coalesce(nullif(trim(p_theme), ''), 'Geral'), coalesce(p_description, ''), trim(p_url), trim(p_embed_url), coalesce(p_thumbnail_url, ''));
  RETURN jsonb_build_object('success', true);
END;
$f$;

CREATE OR REPLACE FUNCTION public.app_update_ebook(p_token text, p_id uuid, p_title text, p_theme text, p_description text, p_url text, p_embed_url text, p_thumbnail_url text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_current_user(p_token) WHERE role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  END IF;
  UPDATE public.educational_ebooks
  SET title = trim(p_title), theme = coalesce(nullif(trim(p_theme), ''), 'Geral'), description = coalesce(p_description, ''), url = trim(p_url), embed_url = trim(p_embed_url), thumbnail_url = coalesce(p_thumbnail_url, ''), updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$f$;

CREATE OR REPLACE FUNCTION public.app_delete_ebook(p_token text, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_current_user(p_token) WHERE role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso não autorizado.');
  END IF;
  DELETE FROM public.educational_ebooks WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$f$;

ALTER FUNCTION public.app_list_ebooks(text) SET row_security = off;
ALTER FUNCTION public.app_add_ebook(text, text, text, text, text, text, text) SET row_security = off;
ALTER FUNCTION public.app_update_ebook(text, uuid, text, text, text, text, text, text) SET row_security = off;
ALTER FUNCTION public.app_delete_ebook(text, uuid) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.app_list_ebooks(text), public.app_add_ebook(text, text, text, text, text, text, text), public.app_update_ebook(text, uuid, text, text, text, text, text, text), public.app_delete_ebook(text, uuid) TO anon, authenticated;

COMMIT;
