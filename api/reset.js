import { fetchServers } from '../lib/servers-query.mjs';
import { restRequest } from '../lib/supabase-rest.mjs';
import { BASELINE } from '../lib/baseline.mjs';

export default async function handler(
  req,
  res,
  deps = { env: process.env, fetchServers, restRequest, now: () => new Date() },
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '허용되지 않는 요청이에요' });
  }

  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = deps.env;
  if (!url || !key) {
    return res.status(500).json({ error: '설정 오류' });
  }

  try {
    // 항상 같은 4행으로 덮어쓰므로 몇 번을 불러도 결과가 같습니다.
    for (const s of BASELINE) {
      await deps.restRequest({
        url,
        key,
        method: 'PATCH',
        path: `/rest/v1/servers?id=eq.${encodeURIComponent(s.id)}`,
        body: { status: s.status, temp_c: s.tempC, fan_ok: s.fanOk, issue: s.issue },
      });
    }
    await deps.restRequest({
      url,
      key,
      method: 'PATCH',
      path: '/rest/v1/incidents?resolved_at=is.null',
      body: { resolved_at: deps.now().toISOString() },
    });

    return res.status(200).json({ servers: await deps.fetchServers({ url, key }) });
  } catch (error) {
    console.error('reset upstream failed, status:', error?.status ?? 'none');
    return res.status(502).json({ error: '불러오지 못했어요' });
  }
}
