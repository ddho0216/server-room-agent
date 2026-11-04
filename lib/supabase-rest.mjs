// 예전 방식 키는 JWT(eyJ로 시작)라 Authorization에도 보내고, 새 sb_secret_ 키는 apikey만 보냅니다.
export function authHeaders(key) {
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

// 오류 메시지에는 키나 주소를 넣지 않습니다. 원인 파악용으로 상태 코드만 status에 담습니다.
function upstreamError(status) {
  const error = new Error('upstream');
  error.status = status;
  return error;
}

function readCount(response) {
  const range = response.headers?.get?.('content-range');
  const total = range?.split('/')[1];
  return total && total !== '*' ? Number(total) : undefined;
}

export async function restRequest({ url, key, path, method = 'GET', body, headers = {}, fetchImpl = fetch }) {
  const init = { method, headers: { ...authHeaders(key), ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchImpl(`${url}${path}`, init);
  } catch {
    throw upstreamError(undefined);
  }
  if (!response.ok) throw upstreamError(response.status);

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data, count: readCount(response) };
}
