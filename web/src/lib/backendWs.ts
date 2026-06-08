/**
 * 浏览器 WebSocket 须与当前页面同主机名，否则 HttpOnly 登录 Cookie 不会附带
 *（常见坑：页面是 localhost，WS 连 127.0.0.1）。
 * 端口取自 NEXT_PUBLIC_API_URL，缺省 3001。
 */
export function backendWsHost(): string {
  if (typeof window === 'undefined') {
    return 'localhost:3001';
  }
  let port = '3001';
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base) {
    try {
      const u = new URL(base);
      port = u.port || (u.protocol === 'https:' ? '443' : '80');
    } catch {
      /* keep default */
    }
  }
  return `${window.location.hostname}:${port}`;
}
