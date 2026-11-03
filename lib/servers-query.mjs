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

// 오류 메시지에는 키나 주소를 넣지 않습니다.
export async function fetchServers({ url, key, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${url}/rest/v1/servers?select=${COLUMNS}&order=slot.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch {
    throw new Error('upstream');
  }
  if (!response.ok) throw new Error('upstream');
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('upstream');
  }
  if (!Array.isArray(body)) throw new Error('upstream');
  return body.map(toServer);
}
