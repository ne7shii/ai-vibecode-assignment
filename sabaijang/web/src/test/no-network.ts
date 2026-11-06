// DoD ข้อ 5: เทสต์ต้องล้มถ้ามีการเรียกออกนอกเครื่อง
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(url, 'http://localhost').hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`network guard: blocked external request to ${host}`);
  }
  return realFetch(input, init);
}) as typeof fetch;
