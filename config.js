export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const isPlaceholder = value => !value || /YOUR_|your_|PLACEHOLDER|<.*>/.test(value);
  const validUrl = /^https:\/\//i.test(url);
  const configured = validUrl && !isPlaceholder(anonKey) && !isPlaceholder(serviceRoleKey);
  return res.status(200).json({
    configured,
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    companyName: 'Україна — Європа',
    crmPath: '/crm/'
  });
}
