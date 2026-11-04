import { restRequest } from '../lib/supabase-rest.mjs';
import { listPending, listLog } from '../lib/store.mjs';

export default async function handler(
  req,
  res,
  deps = { env: process.env, restRequest, store: { listPending, listLog } },
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: '허용되지 않는 요청이에요' });
  }

  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = deps.env;
  if (!url || !key) {
    return res.status(500).json({ error: '설정 오류' });
  }

  const ctx = { url, key, restRequest: deps.restRequest };
  try {
    const [pending, log] = await Promise.all([deps.store.listPending(ctx), deps.store.listLog(ctx, 8)]);
    return res.status(200).json({ pending, log });
  } catch (error) {
    console.error('activity upstream failed, status:', error?.status ?? 'none');
    return res.status(502).json({ error: '불러오지 못했어요' });
  }
}
