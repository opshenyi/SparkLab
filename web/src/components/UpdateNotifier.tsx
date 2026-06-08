'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, ExternalLink, RefreshCw, X } from 'lucide-react';
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

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-md rounded-xl border border-outline/40 bg-surface-lowest/95 p-4 shadow-soft-lg backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          {info.hasUpdate ? <RefreshCw className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </div>
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
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {latestNote?.items?.length ? (
            <ul className="mt-3 space-y-1 text-xs text-on-surface-variant">
              {latestNote.items.slice(0, 3).map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
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
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
