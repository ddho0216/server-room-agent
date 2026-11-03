import { fetchServers } from '../lib/servers-query.mjs';

export default async function handler(req, res, deps = { env: process.env, fetchServers }) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: '허용되지 않는 요청이에요' });
  }

  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = deps.env;
  if (!url || !key) {
    return res.status(500).json({ error: '설정 오류' });
  }

  try {
    const servers = await deps.fetchServers({ url, key });
    return res.status(200).json({ servers });
  } catch {
    return res.status(502).json({ error: '불러오지 못했어요' });
  }
}
