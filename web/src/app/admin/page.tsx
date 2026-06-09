'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { adminAPI } from '@/lib/api';
import Sidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';

type UpdateApplyProgress = {
  id?: string;
  state?: string;
  message?: string;
  error?: string;
  fromVersion?: string;
  toVersion?: string;
  currentCommit?: string;
  targetCommit?: string;
  outputTail?: string;
  logPath?: string;
  containerLogPath?: string;
  updatedAt?: string;
  completedAt?: string;
  refreshRecommended?: boolean;
  autoReloadDelaySeconds?: number;
};

type UpdateInfo = {
  currentVersion?: string;
  latestVersion?: string;
  currentCommit?: string;
  latestCommit?: string;
  runningVersion?: string;
  runningCommit?: string;
  repoVersion?: string;
  repoCommit?: string;
  hasUpdate?: boolean;
  codeChangedWithoutVersion?: boolean;
  needsRedeploy?: boolean;
  dirty?: boolean;
  mandatory?: boolean;
  canApply?: boolean;
  changelog?: Array<{ title?: string; items?: string[] }>;
};

const activeUpdateStates = new Set(['checking', 'fetching', 'pulling', 'building', 'restarting']);
const completedUpdateDismissMs = 5 * 60 * 1000;
const updateStatePercent: Record<string, number> = {
  checking: 10,
  fetching: 25,
  pulling: 45,
  building: 72,
  restarting: 92,
  completed: 100,
  failed: 100,
};

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [stats, setStats] = useState<any>({});
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateProgress, setUpdateProgress] = useState<UpdateApplyProgress | null>(null);
  const [autoReloadIn, setAutoReloadIn] = useState<number | null>(null);
  const [showFailureLog, setShowFailureLog] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const reloadTimerRef = useRef<number | null>(null);
  const reloadCountdownRef = useRef<number | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    } else if (!isLoading && isAuthenticated && user?.role !== 'ADMIN' && user?.role !== 'AUTHOR') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, user, router]);

  useEffect(() => {
    if (isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR')) {
      loadData();
      checkUpdates();
      loadUpdateStatus();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      if (reloadCountdownRef.current) window.clearInterval(reloadCountdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isApplyingUpdate) return;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const res = await adminAPI.updateStatus();
        if (cancelled) return;
        handleUpdateProgress(res.data);
      } catch (error: any) {
        if (cancelled) return;
        if (!error?.response) {
          setUpdateMessage('服务正在重启，等待恢复...');
          setUpdateProgress((prev) => ({
            ...prev,
            state: prev?.state || 'restarting',
            message: '服务正在重启，等待恢复...',
          }));
          return;
        }
        setUpdateMessage(error?.response?.data?.message || '读取更新状态失败');
      }
    };

    pollStatus();
    const timer = window.setInterval(pollStatus, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isApplyingUpdate]);

  const loadData = async () => {
    try {
      const res = await adminAPI.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const checkUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateMessage('');
    try {
      const res = await adminAPI.checkUpdates();
      setUpdateInfo(res.data);
    } catch (error: any) {
      setUpdateMessage(error?.response?.data?.message || '检查更新失败');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const loadUpdateStatus = async () => {
    try {
      const res = await adminAPI.updateStatus();
      handleUpdateProgress(res.data);
    } catch (error) {
      console.error('Failed to load update status:', error);
    }
  };

  const completedProgressKey = (progress: UpdateApplyProgress) =>
    `sparklab-update-reloaded:${progress.id || progress.currentCommit || progress.targetCommit || progress.toVersion || 'latest'}`;

  const completedProgressAge = (progress: UpdateApplyProgress) => {
    if (!progress.completedAt) return 0;
    const completedAt = new Date(progress.completedAt).getTime();
    if (!Number.isFinite(completedAt)) return 0;
    return Date.now() - completedAt;
  };

  const isCompletedProgressDismissed = (progress: UpdateApplyProgress) => {
    if (progress.state !== 'completed') return false;
    if (completedProgressAge(progress) > completedUpdateDismissMs) return true;
    if (typeof window === 'undefined') return false;

    const key = completedProgressKey(progress);
    return Boolean(window.sessionStorage.getItem(key) || window.localStorage.getItem(key));
  };

  const dismissCompletedProgress = () => {
    setUpdateProgress(null);
    setUpdateMessage('');
    setAutoReloadIn(null);
    setIsApplyingUpdate(false);
    void checkUpdates();
  };

  const handleUpdateProgress = (progress: UpdateApplyProgress | null) => {
    if (!progress?.state || progress.state === 'idle') {
      setUpdateProgress(progress);
      setUpdateMessage('');
      setAutoReloadIn(null);
      setIsApplyingUpdate(false);
      return;
    }

    if (progress.state === 'completed' && isCompletedProgressDismissed(progress)) {
      dismissCompletedProgress();
      return;
    }

    setUpdateProgress(progress);
    setUpdateMessage(progress.message || '');

    if (activeUpdateStates.has(progress.state)) {
      setIsApplyingUpdate(true);
      return;
    }

    if (progress.state === 'failed') {
      setIsApplyingUpdate(false);
      setUpdateMessage(progress.error || progress.message || '更新失败');
      return;
    }

    if (progress.state === 'completed') {
      setIsApplyingUpdate(false);
      if (progress.refreshRecommended) {
        scheduleAutoReload(progress);
      } else {
        checkUpdates();
      }
    }
  };

  const scheduleAutoReload = (progress: UpdateApplyProgress) => {
    if (typeof window === 'undefined') return;
    if (progress.completedAt) {
      const completedAt = new Date(progress.completedAt).getTime();
      if (Number.isFinite(completedAt) && Date.now() - completedAt > 10 * 60 * 1000) {
        return;
      }
    }

    const key = completedProgressKey(progress);
    if (window.sessionStorage.getItem(key) || window.localStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
    window.localStorage.setItem(key, String(Date.now()));

    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    if (reloadCountdownRef.current) window.clearInterval(reloadCountdownRef.current);

    let remaining = Math.max(1, progress.autoReloadDelaySeconds || 2);
    setAutoReloadIn(remaining);
    reloadCountdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setAutoReloadIn(Math.max(remaining, 0));
      if (remaining <= 0 && reloadCountdownRef.current) {
        window.clearInterval(reloadCountdownRef.current);
      }
    }, 1000);
    reloadTimerRef.current = window.setTimeout(() => {
      window.location.reload();
    }, remaining * 1000);
  };

  const applyUpdate = async () => {
    if (!window.confirm('确认从 GitHub 拉取更新？更新完成后需要重启服务。')) return;
    setIsApplyingUpdate(true);
    setAutoReloadIn(null);
    setUpdateMessage('正在准备更新...');
    setUpdateProgress({ state: 'checking', message: '正在准备更新...' });
    try {
      const res = await adminAPI.applyUpdate();
      if (res.data?.progress) {
        handleUpdateProgress(res.data.progress);
      } else {
        setUpdateMessage(res.data?.message || '更新已触发，等待服务重启...');
      }
    } catch (error: any) {
      if (!error?.response) {
        setUpdateMessage('服务正在重启，等待恢复...');
        setUpdateProgress((prev) => ({
          ...prev,
          state: 'restarting',
          message: '服务正在重启，等待恢复...',
        }));
        return;
      }
      const message = error?.response?.data?.message || '执行更新失败';
      setUpdateMessage(message);
      setUpdateProgress({
        state: 'failed',
        message,
        error: message,
        outputTail: error?.response?.data?.output || error?.response?.data?.progress?.outputTail,
        logPath: error?.response?.data?.progress?.logPath,
        containerLogPath: error?.response?.data?.progress?.containerLogPath,
      });
      setIsApplyingUpdate(false);
    }
  };

  const getQQAvatar = (qqNumber?: string) => {
    if (!qqNumber) return null;
    return `http://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
  };

  const updateState = updateProgress?.state || 'idle';
  const isUpdateActive = activeUpdateStates.has(updateState);
  const showUpdateProgress = Boolean(
    updateProgress?.message && (isUpdateActive || updateState === 'failed')
  );
  const updateProgressPercent = updateStatePercent[updateState] || 0;
  const updateAvailable = Boolean(
    updateInfo?.hasUpdate || updateInfo?.codeChangedWithoutVersion || updateInfo?.needsRedeploy
  );
  const latestReleaseNote = updateInfo?.changelog?.[0];
  const releasePreviewText = latestReleaseNote?.items?.[0] || '';
  const showReleaseNotes = Boolean(
    (latestReleaseNote?.title || releasePreviewText) && updateAvailable && !showUpdateProgress
  );
  const canApplyUpdate = Boolean(updateAvailable && updateInfo?.canApply);
  const runningVersion = updateInfo?.runningVersion || updateInfo?.currentVersion;
  const runningCommit = updateInfo?.runningCommit || updateInfo?.currentCommit;
  const shortCommit = (commit?: string) => (commit ? commit.slice(0, 7) : '');
  const updateStatusLabel = updateInfo?.needsRedeploy
    ? '需重部署'
    : updateInfo?.hasUpdate
      ? '发现更新'
      : updateInfo?.codeChangedWithoutVersion
        ? '代码已更新'
        : updateInfo
          ? '已是最新'
          : '未检查';
  const updateStatusClass = updateInfo?.needsRedeploy || updateInfo?.codeChangedWithoutVersion
    ? 'bg-status-warning-bg text-status-warning-text'
    : updateInfo?.hasUpdate
      ? 'bg-primary/10 text-primary'
      : updateInfo
        ? 'bg-status-success-bg text-status-success-text'
        : 'bg-surface-container text-on-surface-variant';
  const versionItems = [
    { label: '运行', version: runningVersion || '未检查', commit: shortCommit(runningCommit) },
    { label: '仓库', version: updateInfo?.repoVersion || '未检查', commit: shortCommit(updateInfo?.repoCommit) },
    { label: 'GitHub', version: updateInfo?.latestVersion || '未检查', commit: shortCommit(updateInfo?.latestCommit) },
  ];
  const inlineUpdateMessage = updateState === 'completed'
    ? autoReloadIn !== null
      ? `刷新中 ${autoReloadIn} 秒`
      : ''
    : updateMessage;
  const showInlineUpdateMessage = Boolean(inlineUpdateMessage && !showUpdateProgress);
  const updateProgressLabel = updateState === 'failed' ? '失败' : '更新中';

  if (isLoading) {
    return <LoadingBar />;
  }

  if (isLoggingOut) {
    return <LoadingBar text="退出中" />;
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'AUTHOR')) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <Sidebar />

      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className="flex-1 w-full max-w-[1600px] mx-auto p-6 sm:p-8 lg:p-10">
          <div className="mb-7 space-y-4">
            <div className="min-w-0">
              <h2 className="mb-2 text-3xl font-semibold tracking-normal text-page-title sm:text-4xl">
                统计概览
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-on-surface-variant sm:text-base">
                实时监控系统运行状态和用户活动
              </p>
            </div>

            <section
              aria-label="系统更新"
              className="min-w-0 overflow-hidden rounded-lg bg-surface-lowest px-3 py-2 shadow-[var(--shadow-ring)]"
            >
              <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs leading-5">
                  <h3 className="shrink-0 text-xs font-semibold leading-5 text-page-title">系统更新</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 ${updateStatusClass}`}>
                    {updateStatusLabel}
                  </span>
                  {updateInfo?.dirty ? (
                    <span className="shrink-0 text-[11px] font-medium leading-5 text-status-warning-text">存在本地改动</span>
                  ) : null}
                  {updateInfo?.mandatory ? (
                    <span className="shrink-0 text-[11px] font-medium leading-5 text-status-error-text">重要更新</span>
                  ) : null}
                  <span className="hidden h-3 w-px shrink-0 bg-outline-variant sm:inline-block" />
                  {versionItems.map((item) => (
                    <span key={item.label} className="inline-flex min-w-0 max-w-full items-baseline gap-1 truncate text-on-surface-variant">
                      <span className="shrink-0">{item.label}</span>
                      <span className="min-w-0 truncate font-medium text-on-surface">{item.version}</span>
                      {item.commit ? <span className="hidden shrink-0 font-mono text-[11px] text-on-surface-variant sm:inline">({item.commit})</span> : null}
                    </span>
                  ))}
                  {showInlineUpdateMessage ? (
                    <span className="min-w-0 max-w-full truncate text-on-surface-variant">
                      {inlineUpdateMessage}
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={checkUpdates}
                    disabled={isCheckingUpdate || isApplyingUpdate}
                    className="min-h-7 rounded-md bg-surface-low px-2.5 py-1.5 text-xs font-medium leading-none text-on-surface shadow-[var(--shadow-ring)] transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCheckingUpdate ? '检查中' : '检查'}
                  </button>
                  <button
                    type="button"
                    onClick={applyUpdate}
                    disabled={!canApplyUpdate || isCheckingUpdate || isApplyingUpdate}
                    className="min-h-7 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium leading-none text-on-primary shadow-[var(--shadow-ring)] transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isApplyingUpdate ? '更新中' : '更新'}
                  </button>
                </div>
              </div>

              {showUpdateProgress ? (
                <div className="mt-2 space-y-1.5 border-t border-outline-variant/40 pt-2">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] leading-5">
                    <span
                      className={`shrink-0 font-medium ${
                        updateState === 'failed' ? 'text-status-error-text' : 'text-primary'
                      }`}
                    >
                      {updateProgressLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-on-surface-variant">{updateProgress?.message}</span>
                    <span className="shrink-0 tabular-nums text-on-surface-variant">{updateProgressPercent}%</span>
                  </div>
                  <div className="h-0.5 overflow-hidden rounded-full bg-surface-container">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        updateState === 'failed' ? 'bg-status-error' : 'bg-primary'
                      }`}
                      style={{ width: `${updateProgressPercent}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {showReleaseNotes ? (
                <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-outline-variant/40 pt-2 text-[11px] leading-5 text-on-surface-variant">
                  <span className="max-w-full truncate font-medium text-on-surface sm:shrink-0">
                    {latestReleaseNote?.title || `版本 ${updateInfo?.latestVersion || ''}`}
                  </span>
                  {releasePreviewText ? <span className="hidden min-w-0 truncate sm:block">{releasePreviewText}</span> : null}
                </div>
              ) : null}

              {updateState === 'failed' && (updateProgress?.outputTail || updateProgress?.logPath || updateProgress?.containerLogPath) ? (
                <div className="mt-2 rounded-md bg-surface-container px-2.5 py-2 text-xs text-on-surface-variant">
                  <button
                    type="button"
                    onClick={() => setShowFailureLog((value) => !value)}
                    className="min-h-0 p-0 text-xs font-medium leading-5 text-on-surface hover:text-primary"
                  >
                    {showFailureLog ? '收起失败日志' : '查看失败日志'}
                  </button>
                  {showFailureLog ? (
                    <div>
                      {updateProgress?.outputTail ? (
                        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-on-surface-variant">
                          {updateProgress.outputTail}
                        </pre>
                      ) : null}
                      {updateProgress?.logPath ? (
                        <div className="mt-2 break-all">
                          <span className="font-medium text-on-surface">日志：</span>
                          <span className="font-mono">{updateProgress.logPath}</span>
                        </div>
                      ) : null}
                      {updateProgress?.containerLogPath && updateProgress.containerLogPath !== updateProgress.logPath ? (
                        <div className="mt-1 break-all">
                          <span className="font-medium text-on-surface">容器内：</span>
                          <span className="font-mono">{updateProgress.containerLogPath}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          <div className="space-y-8">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
                  <div className="mb-3">
                    <span className="text-sm font-medium text-on-surface-variant">总用户数</span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-on-surface tabular-nums">{stats.totalUsers || 0}</div>
                </div>

                <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
                  <div className="mb-3">
                    <span className="text-sm font-medium text-on-surface-variant">总课程数</span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-on-surface tabular-nums">{stats.totalCourses || 0}</div>
                </div>

                <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
                  <div className="mb-3">
                    <span className="text-sm font-medium text-on-surface-variant">总实验数</span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-on-surface tabular-nums">{stats.totalLabs || 0}</div>
                </div>

                <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
                  <div className="mb-3">
                    <span className="text-sm font-medium text-on-surface-variant">运行容器</span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-status-success tabular-nums">{stats.activeContainers || 0}</div>
                </div>

                <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50 sm:col-span-2 lg:col-span-1">
                  <div className="mb-3">
                    <span className="text-sm font-medium text-on-surface-variant">总提交数</span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-on-surface tabular-nums">{stats.totalSubmissions || 0}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="app-card p-6 sm:p-8">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="font-display text-page-title text-xl font-bold tracking-tight">最近活跃学生</h3>
                    <button
                      onClick={() => router.push('/admin/users')}
                      className="text-sm font-semibold text-primary transition-colors hover:text-primary-dim"
                    >
                      查看全部
                    </button>
                  </div>
                  <div className="space-y-2">
                    {stats.recentUsers?.length ? (
                      stats.recentUsers.map((user: any) => {
                        const ts = user.lastActiveAt as number | undefined;
                        const lastMs =
                          ts != null && ts > 0
                            ? ts > 1_000_000_000_000
                              ? ts
                              : ts * 1000
                            : null;
                        return (
                          <div
                            key={user.id}
                            className="flex items-center gap-3 rounded-xl bg-surface-low p-3 transition-colors hover:bg-surface-container dark:hover:bg-surface-container/90"
                          >
                            {user.qqNumber ? (
                              <img
                                src={getQQAvatar(user.qqNumber) || ''}
                                alt={user.displayName || user.username}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                {(user.displayName || user.username).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-on-surface">{user.displayName || user.username}</div>
                              <div className="text-xs text-on-surface-variant">
                                {user._count.containers} 容器 · {user._count.submissions} 提交
                              </div>
                            </div>
                            <div className="text-xs text-on-surface-variant whitespace-nowrap">
                              {lastMs != null ? new Date(lastMs).toLocaleDateString('zh-CN') : '—'}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="py-6 text-center text-sm text-on-surface-variant">暂无学生账号或暂无活跃记录</p>
                    )}
                  </div>
                </div>

                <div className="app-card p-6 sm:p-8">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="font-display text-page-title text-xl font-bold tracking-tight">热门课程</h3>
                    <button
                      onClick={() => router.push('/admin/courses')}
                      className="text-sm font-semibold text-primary transition-colors hover:text-primary-dim"
                    >
                      查看全部
                    </button>
                  </div>
                  <div className="space-y-2">
                    {stats.courseStats?.map((course: any, index: number) => (
                      <div key={course.id} className="flex items-center gap-3 rounded-xl bg-surface-low p-3 transition-colors hover:bg-surface-container dark:hover:bg-surface-container/90">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          index === 0 ? 'bg-primary/15 text-primary' :
                          index === 1 ? 'bg-status-neutral-bg text-status-neutral-text' :
                          index === 2 ? 'bg-status-warning-bg text-status-warning-text' :
                          'bg-surface-container-lowest text-on-surface-variant'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-on-surface">{course.title}</div>
                          <div className="text-xs text-on-surface-variant">
                            {course._count.labs} 实验
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold tabular-nums text-primary">{course._count.enrollments}</div>
                          <div className="text-xs text-on-surface-variant">注册</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
        </div>
      </main>
    </div>
  );
}
