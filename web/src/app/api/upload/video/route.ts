import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('video') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    // 检查文件类型
    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'File must be a video' },
        { status: 400 }
      );
    }

    // 生成唯一文件名
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${randomBytes(16).toString('hex')}.${fileExt}`;
    const filePath = join(process.cwd(), 'public', 'uploads', 'videos', fileName);
    
    // 保存文件
    await writeFile(filePath, buffer);
    
    // 返回可访问的URL
    const videoUrl = `/uploads/videos/${fileName}`;
    
    return NextResponse.json({
      success: true,
      url: videoUrl,
      fileName: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error('Video upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload video' },
      { status: 500 }
    );
  }
}
