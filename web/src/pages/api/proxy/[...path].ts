import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL =
  process.env.SERVER_URL ||
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'expect',
  'accept-encoding',
  'content-encoding',
  'content-length',
]);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = (req.method || 'GET').toUpperCase();
  const pathSegments = normalizePath(req.query.path);

  try {
    const targetUrl = buildBackendUrl(req, pathSegments);
    const headers = buildProxyHeaders(req, method);
    const body = shouldForwardBody(method) ? await readRequestBody(req) : undefined;

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    copyUpstreamHeaders(upstream.headers, res);
    res.status(upstream.status);

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    if (responseBody.length === 0) {
      res.end();
      return;
    }
    res.send(responseBody);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json(
      process.env.NODE_ENV === 'development'
        ? { message: 'Proxy request failed', error: String(error) }
        : { message: 'Proxy request failed' }
    );
  }
}

function normalizePath(rawPath: string | string[] | undefined): string[] {
  if (!rawPath) return [];
  return Array.isArray(rawPath) ? rawPath : [rawPath];
}

function buildBackendUrl(req: NextApiRequest, pathSegments: string[]) {
  const base = BACKEND_URL.endsWith('/') ? BACKEND_URL : `${BACKEND_URL}/`;
  const requestUrl = new URL(req.url || '/', getRequestOrigin(req));
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
  return new URL(`${encodedPath}${requestUrl.search}`, base);
}

function buildProxyHeaders(req: NextApiRequest, method: string): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower.startsWith('x-forwarded-')) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  if (isUnsafeMethod(method)) {
    const origin = getRequestOrigin(req);
    headers.set('Origin', origin);
    headers.set('Referer', `${origin}/`);
    headers.set('X-SparkLab-Proxy-Origin', origin);
  }

  if (shouldForwardBody(method) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
  const accessToken = accessTokenFromCookie(cookie);
  if (isUnsafeMethod(method) && accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

function getRequestOrigin(req: NextApiRequest) {
  const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']);
  const proto =
    forwardedProto ||
    ((req.socket as typeof req.socket & { encrypted?: boolean }).encrypted
      ? 'https'
      : 'http');
  const host = firstHeaderValue(req.headers['x-forwarded-host']) || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.split(',')[0]?.trim() || '';
  return value?.split(',')[0]?.trim() || '';
}

function shouldForwardBody(method: string) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function isUnsafeMethod(method: string) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function readRequestBody(req: NextApiRequest): Promise<BodyInit | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      resolve(body.length > 0 ? new Uint8Array(body) : undefined);
    });
    req.on('error', reject);
  });
}

function copyUpstreamHeaders(headers: Headers, res: NextApiResponse) {
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === 'set-cookie') {
      return;
    }
    res.setHeader(key, value);
  });

  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];
  if (setCookies.length > 0) {
    res.setHeader('Set-Cookie', setCookies);
  }
}

function accessTokenFromCookie(cookie: string) {
  if (!cookie) return '';
  for (const part of cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === 'access_token') {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return '';
}
