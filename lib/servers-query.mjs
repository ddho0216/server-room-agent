const COLUMNS = 'id,name,slot,status,temp_c,fan_ok';

function toServer(row) {
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    !Number.isInteger(row.slot) ||
    typeof row.status !== 'string' ||
    typeof row.temp_c !== 'number' ||
    typeof row.fan_ok !== 'boolean'
  ) {
    throw new Error('upstream');
  }
  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    status: row.status,
    tempC: row.temp_c,
    fanOk: row.fan_ok,
  };
}

// 오류 메시지에는 키나 주소를 넣지 않습니다. 원인 파악용으로 상태 코드만 status에 담습니다.
function upstreamError(status) {
  const error = new Error('upstream');
  error.status = status;
  return error;
}

// 예전 방식 키는 JWT(eyJ로 시작)라 Authorization에도 보내고, 새 sb_secret_ 키는 apikey만 보냅니다.
function authHeaders(key) {
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export async function fetchServers({ url, key, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${url}/rest/v1/servers?select=${COLUMNS}&order=slot.asc`, {
      headers: authHeaders(key),
    });
  } catch {
    throw upstreamError(undefined);
  }
  if (!response.ok) throw upstreamError(response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('upstream');
  }
  if (!Array.isArray(body)) throw new Error('upstream');
  return body.map(toServer);
}
