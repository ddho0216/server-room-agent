export const INCIDENT_TYPES = ['temp', 'disk', 'network'];

const PATCHES = {
  temp: { status: 'warn', tempC: 86, fanOk: false, issue: 'temp' },
  disk: { status: 'warn', issue: 'disk' },
  network: { status: 'down', issue: 'network' },
};

export function incidentPatch(type) {
  if (!Object.hasOwn(PATCHES, type)) throw new Error('unknown incident type');
  return { ...PATCHES[type] };
}
