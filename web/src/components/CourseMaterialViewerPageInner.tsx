'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { courseMaterialAPI } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';
import { ArrowLeft, Download } from 'lucide-react';

function effectiveFileKind(meta: { fileKind: string; originalName: string } | null): string | null {
  if (!meta) return null;
  if (meta.fileKind && meta.fileKind !== 'other') return meta.fileKind;
  const n = meta.originalName.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.doc') || n.endsWith('.docx')) return 'word';
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return 'ppt';
  return meta.fileKind;
}

type Props = { materialId: string };

export default function CourseMaterialViewerPageInner({ materialId }: Props) {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [meta, setMeta] = useState<{ title: string; fileKind: string; originalName: string } | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const filePath = useMemo(() => courseMaterialAPI.fileUrl(materialId), [materialId]);

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || !materialId) return;
    setLoadError(false);
    courseMaterialAPI
      .getOne(materialId)
      .then((res) => {
        const d = res.data as {
          courseId: string;
          title: string;
          fileKind: string;
          originalName: string;
        };
        setCourseId(d.courseId);
        setMeta({ title: d.title, fileKind: d.fileKind, originalName: d.originalName });
      })
      .catch(() => {
        setMeta(null);
        setCourseId(null);
        setLoadError(true);
      });
  }, [isAuthenticated, materialId]);

  const kind = effectiveFileKind(meta);

  useEffect(() => {
    if (!isAuthenticated || !materialId || kind !== 'pdf') {
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfError(null);
      setPdfLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setPdfLoading(true);
    setPdfError(null);

    fetch(filePath, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 403) throw new Error('无权访问此课件');
          const t = await r.text();
          throw new Error(t.slice(0, 120) || `加载失败（${r.status}）`);
        }
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isAuthenticated, materialId, kind, filePath]);

  if (isLoading) {
    return <LoadingBar />;
  }
  if (!isAuthenticated) {
    return null;
  }

  const isOfficeKind = kind === 'word' || kind === 'ppt';

  const backHref = courseId ? `/courses/${courseId}` : '/explore';

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <Sidebar />
      <main className="flex-1 lg:ml-64 p-4 pt-20 lg:pt-6 flex flex-col min-h-0">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            返回课程
          </button>
          {meta && (
            <span className="text-page-title font-semibold truncate flex-1 min-w-0">{meta.title}</span>
          )}
          <a
            href={filePath}
            download={meta?.originalName}
            className="inline-flex items-center gap-1 text-sm text-primary"
          >
            <Download className="w-4 h-4" />
            下载
          </a>
        </div>

        <div className="flex-1 min-h-[70vh] rounded-xl overflow-hidden bg-surface-container/30 shadow-soft">
          {loadError && (
            <div className="p-8 text-center text-on-surface-variant space-y-2">
              <p className="text-on-surface font-medium">无法加载课件</p>
              <p className="text-sm">课件不存在或您无权访问。</p>
              <button type="button" onClick={() => router.push(backHref)} className="text-primary text-sm font-medium">
                返回课程
              </button>
            </div>
          )}

          {!loadError && kind === 'pdf' && pdfLoading && (
            <div className="p-8 text-center text-on-surface-variant">正在加载 PDF 预览…</div>
          )}
          {!loadError && kind === 'pdf' && pdfError && (
            <div className="p-8 text-center text-on-surface-variant space-y-3">
              <p className="text-on-surface font-medium">无法预览</p>
              <p className="text-sm">{pdfError}</p>
              <a href={filePath} className="inline-flex items-center gap-1 text-primary font-medium" download={meta?.originalName}>
                <Download className="w-4 h-4" />
                下载后本地打开
              </a>
            </div>
          )}
          {!loadError && kind === 'pdf' && pdfBlobUrl && !pdfError && (
            <iframe title={meta?.title ?? '课件'} src={pdfBlobUrl} className="w-full h-full min-h-[70vh] border-0" />
          )}

          {!loadError && isOfficeKind && (
            <div className="p-6 sm:p-8 max-w-xl mx-auto text-center text-on-surface-variant space-y-4">
              <p className="text-on-surface font-medium text-base">Word / PPT 无法在此页内嵌预览</p>
              <p className="text-sm leading-relaxed text-left">
                微软 Office 在线预览需要从<strong>公网</strong>拉取您的文件，且<strong>不能携带您在本站的登录信息</strong>。
                当前课件下载链接需要登录后才能访问，因此在线预览会失败（空白或报错）。
              </p>
              <p className="text-sm leading-relaxed text-left">请使用上方「下载」，用本机安装的 Word 或 PowerPoint 打开即可正常上课展示。</p>
              <a
                href={filePath}
                download={meta?.originalName}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:opacity-95"
              >
                <Download className="w-4 h-4" />
                下载 {meta?.originalName ?? '课件'}
              </a>
            </div>
          )}

          {!loadError && meta && kind && kind !== 'pdf' && !isOfficeKind && (
            <div className="p-8 text-center text-on-surface-variant">
              <p className="mb-4">该格式请下载后使用本地软件打开。</p>
              <a href={filePath} className="text-primary font-medium" download={meta.originalName}>
                下载 {meta.originalName}
              </a>
            </div>
          )}

          {!loadError && meta && !kind && (
            <div className="p-8 text-center text-on-surface-variant">
              <p className="mb-4">无法识别课件类型，请下载后打开。</p>
              <a href={filePath} className="text-primary font-medium" download={meta.originalName}>
                下载 {meta.originalName}
              </a>
            </div>
          )}

          {!loadError && !meta && (
            <div className="p-8 text-center text-on-surface-variant">加载课件信息…</div>
          )}
        </div>
      </main>
    </div>
  );
}
