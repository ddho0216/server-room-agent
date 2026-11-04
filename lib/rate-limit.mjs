import { restRequest as defaultRestRequest } from './supabase-rest.mjs';

export const WINDOW_MINUTES = 10;
export const MAX_INCIDENTS = 10;

// 서버리스 함수는 메모리를 공유하지 않으므로 incidents 테이블의 최근 건수로 셉니다(전체 공통 한도).
export async function isOverLimit({ url, key, now = new Date(), restRequest = defaultRestRequest }) {
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await restRequest({
    url,
    key,
    path: `/rest/v1/incidents?select=id&started_at=gte.${encodeURIComponent(since)}`,
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  return (count ?? 0) >= MAX_INCIDENTS;
}
