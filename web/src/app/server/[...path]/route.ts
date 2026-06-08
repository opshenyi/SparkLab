import { NextRequest, NextResponse } from 'next/server';
import { forwardUpstreamHeaders } from '@/lib/forwardUpstreamHeaders';

// Server URL - only accessible from server-side (internal network)
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

const isDev = process.env.NODE_ENV === 'development';

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
    const searchParams = request.nextUrl.searchParams.toString();
    const serverUrl = `${SERVER_URL}/${path}${searchParams ? `?${searchParams}` : ''}`;

    if (isDev) {
      console.log(`[Proxy] ${method} ${serverUrl}`);
    }

    // Get request body for POST/PUT/PATCH
    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const contentType = request.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        try {
          const text = await request.text();
          if (text) {
            body = text;
          }
        } catch (e) {
          // No body is fine for PATCH
        }
      } else {
        try {
          body = await request.text();
        } catch (e) {
          // No body is fine
        }
      }
    }

    // Forward headers (excluding host and connection headers)
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        !['host', 'connection', 'content-length'].includes(lowerKey)
      ) {
        headers[key] = value;
      }
    });

    // Make request to server
    const response = await fetch(serverUrl, {
      method,
      headers,
      body,
      credentials: 'include',
    });

    if (isDev) {
      console.log(`[Proxy] Response status: ${response.status}`);
    }

    // Clone response to avoid consuming the body
    const clonedResponse = response.clone();
    
    // Get response body
    let responseBody;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await clonedResponse.text();
      }
    } else {
      responseBody = await response.text();
    }

    const responseHeaders = new Headers();
    forwardUpstreamHeaders(response.headers, responseHeaders);

    // Return appropriate response type
    if (typeof responseBody === 'string') {
      return new NextResponse(responseBody, {
        status: response.status,
        headers: responseHeaders,
      });
    }
    return NextResponse.json(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Proxy] Error:', error);
    if (isDev) {
      console.error('[Proxy] SERVER_URL:', SERVER_URL);
      console.error('[Proxy] Path:', pathSegments.join('/'));
    }
    return NextResponse.json(
      {
        error: 'Server connection failed',
        ...(isDev && {
          details: error instanceof Error ? error.message : 'Unknown error',
          serverUrl: SERVER_URL,
        }),
      },
      { status: 502 }
    );
  }
}
