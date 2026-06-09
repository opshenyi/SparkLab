import { NextRequest, NextResponse } from 'next/server';
import { forwardUpstreamHeaders } from '@/lib/forwardUpstreamHeaders';

const BACKEND_URL =
  process.env.SERVER_URL ||
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'PUT');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'DELETE');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    const path = pathSegments.join('/');
    const url = new URL(request.url);
    const backendUrl = `${BACKEND_URL}/${path}${url.search}`;
    const isMaterialFileDownload =
      method === 'GET' &&
      pathSegments[0] === 'course-materials' &&
      pathSegments[pathSegments.length - 1] === 'file';

    const contentType = request.headers.get('Content-Type') || '';

    let body: BodyInit | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        if (contentType.includes('multipart/form-data')) {
          body = await request.arrayBuffer();
        } else {
          body = await request.text();
        }
      } catch {
        // No body or already consumed
      }
    }

    const headers: HeadersInit = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Content-Type'] = 'application/json';
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers['Origin'] = url.origin;
    }

    // Forward cookies (important for authentication)
    const cookie = request.headers.get('cookie');
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    // Forward authorization header if present
    const auth = request.headers.get('authorization');
    if (auth) {
      headers['Authorization'] = auth;
    }

    // Make the request to backend
    const response = await fetch(backendUrl, {
      method,
      headers,
      body,
      credentials: 'include',
    });

    const responseBody = isMaterialFileDownload
      ? await response.arrayBuffer()
      : await response.text();

    const nextResponse = new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
    });

    forwardUpstreamHeaders(response.headers, nextResponse.headers);

    return nextResponse;
  } catch (error) {
    console.error('Proxy error:', error);
    const body =
      process.env.NODE_ENV === 'development'
        ? { message: 'Proxy request failed', error: String(error) }
        : { message: 'Proxy request failed' };
    return NextResponse.json(body, { status: 500 });
  }
}
