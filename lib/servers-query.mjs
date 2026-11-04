import { restRequest } from './supabase-rest.mjs';

const COLUMNS = 'id,name,slot,status,temp_c,fan_ok,issue';

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
    issue: typeof row.issue === 'string' ? row.issue : null,
  };
}

export async function fetchServers({ url, key, fetchImpl = fetch }) {
  const { data } = await restRequest({
    url,
    key,
    path: `/rest/v1/servers?select=${COLUMNS}&order=slot.asc`,
    fetchImpl,
  });
  if (!Array.isArray(data)) throw new Error('upstream');
  return data.map(toServer);
}
