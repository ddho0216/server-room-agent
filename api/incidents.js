import { fetchServers } from '../lib/servers-query.mjs';
import { restRequest } from '../lib/supabase-rest.mjs';
import { INCIDENT_TYPES, incidentPatch } from '../lib/incident-effects.mjs';
import { isOverLimit } from '../lib/rate-limit.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 화면 모양(tempC, fanOk)의 패치를 DB 칸 이름(temp_c, fan_ok)으로 바꿉니다.
function toRow({ status, tempC, fanOk, issue }) {
  const row = { status, issue };
  if (tempC !== undefined) row.temp_c = tempC;
  if (fanOk !== undefined) row.fan_ok = fanOk;
  return row;
}

export default async function handler(
  req,
  res,
  deps = { env: process.env, fetchServers, restRequest },
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

  const { body } = req;
  if (
    !isPlainObject(body) ||
    !INCIDENT_TYPES.includes(body.type) ||
    typeof body.serverId !== 'string'
  ) {
    return res.status(400).json({ error: '잘못된 요청이에요' });
  }

  try {
    const servers = await deps.fetchServers({ url, key });
    if (!servers.some((s) => s.id === body.serverId)) {
      return res.status(404).json({ error: '없는 서버예요' });
    }

    if (await isOverLimit({ url, key, restRequest: deps.restRequest })) {
      return res.status(429).json({ error: '잠시 후에 다시 해 주세요' });
    }

    await deps.restRequest({
      url,
      key,
      method: 'POST',
      path: '/rest/v1/incidents',
      body: { server_id: body.serverId, type: body.type },
    });
    await deps.restRequest({
      url,
      key,
      method: 'PATCH',
      path: `/rest/v1/servers?id=eq.${encodeURIComponent(body.serverId)}`,
      body: toRow(incidentPatch(body.type)),
    });

    return res.status(200).json({ servers: await deps.fetchServers({ url, key }) });
  } catch (error) {
    console.error('incidents upstream failed, status:', error?.status ?? 'none');
    return res.status(502).json({ error: '불러오지 못했어요' });
  }
}
