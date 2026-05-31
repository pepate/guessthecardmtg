export const DEVICE_ID_KEY = 'guessthecard.deviceid';

/** Stable anonymous identity for this browser. Generated once, then reused. */
export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
