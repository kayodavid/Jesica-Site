const url = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const key = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
async function run() {
  const sql = `
    DROP FUNCTION IF EXISTS public.app_list_videos(text);
    DROP FUNCTION IF EXISTS public.app_list_videos();
    CREATE OR REPLACE FUNCTION public.app_list_videos(p_token text DEFAULT NULL)
    RETURNS SETOF public.educational_videos 
    LANGUAGE sql 
    SECURITY DEFINER 
    SET search_path = public
    AS $$ 
      SELECT * FROM public.educational_videos ORDER BY created_at DESC; 
    $$;
  `;
  const r = await fetch(url + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  console.log(r.status, await r.text());
}
run();
