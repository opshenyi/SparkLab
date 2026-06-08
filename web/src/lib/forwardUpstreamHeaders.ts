/**
 * 将上游 fetch Response 的 Headers 复制到 NextResponse/Headers，
 * 正确处理多条 Set-Cookie（避免只用 get('set-cookie') 丢 cookie）。
 */
const SKIP = new Set(['connection', 'transfer-encoding', 'content-length']);

export function forwardUpstreamHeaders(from: Headers, to: Headers): void {
  const setCookies =
    typeof from.getSetCookie === 'function' ? from.getSetCookie() : [];

  from.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SKIP.has(lower) || lower === 'set-cookie') {
      return;
    }
    to.set(key, value);
  });

  for (const cookie of setCookies) {
    to.append('Set-Cookie', cookie);
  }
}
