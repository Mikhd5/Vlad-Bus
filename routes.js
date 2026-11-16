import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ configured: false, routes: [] });
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.from('routes')
      .select('id,country,from_city,to_city,default_price,currency,duration_text')
      .eq('active', true).order('country').order('from_city');
    if (error) throw error;
    return res.status(200).json({ configured: true, routes: data || [] });
  } catch (error) {
    console.error('Public routes API error:', error);
    return res.status(500).json({ error: 'Не вдалося завантажити напрямки.' });
  }
}
