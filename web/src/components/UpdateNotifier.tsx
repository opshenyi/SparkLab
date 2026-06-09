'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { updateAPI } from '@/lib/api';

type Announcement = {
  enabled?: boolean;
  level?: string;
  title?: string;
  message?: string;
};

type ReleaseNote = {
  version: string;
  date?: string;
  title?: string;
  items?: string[];
};

type UpdateInfo = {
  currentVersion?: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  mandatory?: boolean;
  title?: string;
  latestUrl?: string;
  announcement?: Announcement;
  changelog?: ReleaseNote[];
};

export default function UpdateNotifier() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname() || '';

  useEffect(() => {
    let alive = true;
    updateAPI
      .check()
      .then((res) => {
        if (alive) setInfo(res.data);
      })
      .catch(() => {
        // 静默失败，避免 GitHub 临时不可用影响正常使用。
      });
    return () => {
      alive = false;
    };
  }, []);

  const storageKey = useMemo(() => {
    if (!info) return '';
    const version = info.latestVersion || info.currentVersion || 'unknown';
    const title = info.announcement?.title || info.title || '';
    return `sparklab-update-dismissed:${version}:${title}`;
  }, [info]);

  useEffect(() => {
    if (!storageKey) return;
    setDismissed(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (!info || dismissed) return null;

  const announcement = info.announcement;
  const shouldShow = info.hasUpdate || announcement?.enabled;
  if (!shouldShow) return null;

  const latestNote = info.changelog?.[0];
  const compactAuthPage =
    pathname === '/login' || pathname === '/register' || pathname === '/force-password-change';

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  return (
    <div
      className={`fixed right-4 z-[70] w-[calc(100vw-2rem)] rounded-xl border border-[color:var(--color-hairline)] bg-surface-lowest/95 shadow-[0_0_0_1px_var(--color-hairline)] backdrop-blur-md ${
        compactAuthPage ? 'top-4 max-w-sm p-3' : 'bottom-4 max-w-md p-4'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-on-surface">
                {info.hasUpdate ? `发现新版本 ${info.latestVersion}` : announcement?.title || info.title || '系统公告'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                {announcement?.message || latestNote?.title || '管理员可在控制台检查并应用更新。'}
              </p>
            </div>
            {!info.mandatory && (
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                title="关闭"
              >
                关闭
              </button>
            )}
          </div>

          {!compactAuthPage && latestNote?.items?.length ? (
            <ul className="mt-3 space-y-1 text-xs text-on-surface-variant">
              {latestNote.items.slice(0, 3).map((item) => (
                <li key={item}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={`${compactAuthPage ? 'mt-2' : 'mt-3'} flex items-center justify-between gap-3 text-xs text-on-surface-variant`}>
            <span>
              当前 {info.currentVersion || '-'} · 最新 {info.latestVersion || '-'}
            </span>
            {info.latestUrl && (
              <a
                href={info.latestUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-dim"
              >
                GitHub
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
