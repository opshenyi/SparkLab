import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { randomBytes } from 'crypto';
import { extname, join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL =
  process.env.SERVER_URL ||
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const maxVideoUploadBytes = Number.parseInt(process.env.VIDEO_UPLOAD_MAX_BYTES || '', 10) || 512 * 1024 * 1024;
const uploadOverheadBytes = 1024 * 1024;

const allowedVideoTypes: Record<string, string[]> = {
  '.mp4': ['video/mp4', 'application/mp4'],
  '.m4v': ['video/mp4', 'video/x-m4v'],
  '.mov': ['video/quicktime', 'video/mp4'],
  '.webm': ['video/webm'],
  '.ogv': ['video/ogg', 'application/ogg'],
};

type ProfileResponse = {
  authenticated?: boolean;
  user?: {
    role?: string;
  } | null;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getUploadUser(request);
    const role = user?.role || '';
    if (!user || !['TEACHER', 'ADMIN', 'AUTHOR'].includes(role)) {
      return NextResponse.json({ error: '无权上传视频' }, { status: 403 });
    }

    const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
    if (Number.isFinite(contentLength) && contentLength > maxVideoUploadBytes + uploadOverheadBytes) {
      return NextResponse.json({ error: '视频文件过大' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('video') as File;
    if (!file) {
      return NextResponse.json({ error: '未选择视频文件' }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: '视频文件为空' }, { status: 400 });
    }
    if (file.size > maxVideoUploadBytes) {
      return NextResponse.json({ error: '视频文件过大' }, { status: 413 });
    }

    const fileExt = extname(file.name || '').toLowerCase();
    const allowedTypes = allowedVideoTypes[fileExt];
    if (!allowedTypes) {
      return NextResponse.json({ error: '仅支持 mp4、m4v、mov、webm、ogv 视频文件' }, { status: 400 });
    }

    if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
      return NextResponse.json({ error: '视频 MIME 类型与扩展名不匹配' }, { status: 400 });
    }

    const head = Buffer.from(await file.slice(0, Math.min(file.size, 4096)).arrayBuffer());
    if (!looksLikeAllowedVideo(fileExt, head)) {
      return NextResponse.json({ error: '视频文件头校验失败' }, { status: 400 });
    }

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'videos');
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${randomBytes(16).toString('hex')}${fileExt}`;
    const filePath = join(uploadDir, fileName);

    await pipeline(
      Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(filePath, { flags: 'wx', mode: 0o644 })
    );

    return NextResponse.json({
      success: true,
      url: `/uploads/videos/${fileName}`,
      fileName: file.name,
      size: file.size,
      contentType: file.type || allowedTypes[0],
    });
  } catch (error) {
    console.error('Video upload error:', error);
    return NextResponse.json({ error: '视频上传失败' }, { status: 500 });
  }
}

async function getUploadUser(request: NextRequest) {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers.Cookie = cookie;
  const authorization = request.headers.get('authorization');
  if (authorization) headers.Authorization = authorization;
  if (!headers.Cookie && !headers.Authorization) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/auth/profile`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as ProfileResponse;
    return profile.authenticated ? profile.user : null;
  } catch {
    return null;
  }
}

function looksLikeAllowedVideo(ext: string, head: Buffer) {
  if (head.length < 4) return false;
  if (ext === '.webm') {
    return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  }
  if (ext === '.ogv') {
    return head.subarray(0, 4).toString('ascii') === 'OggS';
  }
  if (ext === '.mp4' || ext === '.m4v' || ext === '.mov') {
    return head.length >= 12 && head.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}
