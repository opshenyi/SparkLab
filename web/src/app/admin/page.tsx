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

  const handleUpdateProgress = (progress: UpdateApplyProgress | null) => {
    if (!progress?.state || progress.state === 'idle') {
      setUpdateProgress(progress);
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

    const key = `sparklab-update-reloaded:${progress.id || progress.currentCommit || progress.toVersion || 'latest'}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');

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
      });
      setIsApplyingUpdate(false);
    }
  };

  const getQQAvatar = (qqNumber?: string) => {
    if (!qqNumber) return null;
    return `http://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
  };

  const updateState = updateProgress?.state || 'idle';
  const showUpdateProgress = updateState !== 'idle' && updateProgress?.message;
  const isUpdateActive = activeUpdateStates.has(updateState);
  const updateProgressPercent = updateStatePercent[updateState] || 0;
  const updateAvailable = Boolean(
    updateInfo?.hasUpdate || updateInfo?.codeChangedWithoutVersion || updateInfo?.needsRedeploy
  );
  const canApplyUpdate = Boolean(updateAvailable && updateInfo?.canApply);
  const runningVersion = updateInfo?.runningVersion || updateInfo?.currentVersion;
  const runningCommit = updateInfo?.runningCommit || updateInfo?.currentCommit;
  const shortCommit = (commit?: string) => (commit ? commit.slice(0, 7) : '');

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
        <div className="flex-1 w-full max-w-[1600px] mx-auto p-8 lg:p-10">
          <div className="mb-12">
            <h2 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-2">
              统计概览
            </h2>
            <p className="text-on-surface-variant text-lg max-w-2xl leading-relaxed">
              实时监控系统运行状态和用户活动
            </p>
          </div>

          <div className="space-y-8">
              <div className="app-card p-6 sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-primary">
                      <h3 className="font-display text-page-title text-xl font-bold tracking-tight">系统更新</h3>
                    </div>
                    <div className="grid gap-2 text-sm text-on-surface-variant sm:grid-cols-3">
                      <div className="min-w-0">
                        <span className="font-medium text-on-surface">运行中</span>{' '}
                        {runningVersion || '未检查'}
                        {shortCommit(runningCommit) ? (
                          <span className="ml-1 font-mono text-xs">({shortCommit(runningCommit)})</span>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-on-surface">仓库</span>{' '}
                        {updateInfo?.repoVersion || '未检查'}
                        {shortCommit(updateInfo?.repoCommit) ? (
                          <span className="ml-1 font-mono text-xs">({shortCommit(updateInfo?.repoCommit)})</span>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-on-surface">GitHub</span>{' '}
                        {updateInfo?.latestVersion || '未检查'}
                        {shortCommit(updateInfo?.latestCommit) ? (
                          <span className="ml-1 font-mono text-xs">({shortCommit(updateInfo?.latestCommit)})</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      {updateInfo?.needsRedeploy ? (
                        <span className="rounded-full bg-status-warning/10 px-3 py-1 font-medium text-status-warning">
                          代码已拉取，运行仍是旧版本
                        </span>
                      ) : updateInfo?.hasUpdate ? (
                        <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">发现更新</span>
                      ) : updateInfo?.codeChangedWithoutVersion ? (
                        <span className="rounded-full bg-status-warning/10 px-3 py-1 font-medium text-status-warning">
                          GitHub 有新代码但版本号未变化
                        </span>
                      ) : updateInfo ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/10 px-3 py-1 font-medium text-status-success">
                          已是最新
                        </span>
                      ) : null}
                      {updateInfo?.dirty && (
                        <span className="rounded-full bg-status-warning/10 px-3 py-1 font-medium text-status-warning">
                          存在本地改动
                        </span>
                      )}
                      {updateInfo?.mandatory && (
                        <span className="rounded-full bg-status-error/10 px-3 py-1 font-medium text-status-error">
                          重要更新
                        </span>
                      )}
                      {updateMessage && <span className="text-on-surface-variant">{updateMessage}</span>}
                    </div>
                    {showUpdateProgress ? (
                      <div className="mt-4 rounded-lg bg-surface-low p-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="inline-flex min-w-0 items-center gap-2 font-medium text-on-surface">
                            {isUpdateActive ? (
                              <span className="shrink-0 text-primary">更新中</span>
                            ) : updateState === 'failed' ? (
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-status-error" />
                            ) : (
                              <span className="shrink-0 text-status-success">完成</span>
                            )}
                            <span className="truncate">{updateProgress?.message}</span>
                          </div>
                          <span className="shrink-0 tabular-nums text-on-surface-variant">
                            {updateProgressPercent}%
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              updateState === 'failed' ? 'bg-status-error' : 'bg-primary'
                            }`}
                            style={{ width: `${updateProgressPercent}%` }}
                          />
                        </div>
                        {autoReloadIn !== null ? (
                          <div className="mt-2 text-sm text-on-surface-variant">
                            更新完成，{autoReloadIn} 秒后自动刷新页面
                          </div>
                        ) : updateState === 'restarting' ? (
                          <div className="mt-2 text-sm text-on-surface-variant">
                            服务重启期间页面可能短暂失去连接，恢复后会自动刷新。
                          </div>
                        ) : null}
                        {updateState === 'failed' && updateProgress?.outputTail ? (
                          <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-container p-3 text-xs text-on-surface-variant">
                            {updateProgress.outputTail}
                          </pre>
                        ) : null}
                      </div>
                    ) : null}
                    {updateInfo?.changelog?.[0]?.items?.length ? (
                      <div className="mt-4 rounded-lg bg-surface-low p-3">
                        <div className="mb-2 text-sm font-semibold text-on-surface">
                          {updateInfo.changelog[0].title || `版本 ${updateInfo.latestVersion}`}
                        </div>
                        <ul className="space-y-1 text-sm text-on-surface-variant">
                          {updateInfo.changelog[0].items.slice(0, 4).map((item: string) => (
                            <li key={item}>· {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={checkUpdates}
                      disabled={isCheckingUpdate || isApplyingUpdate}
                      className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCheckingUpdate ? '检查中' : '检查'}
                    </button>
                    <button
                      type="button"
                      onClick={applyUpdate}
                      disabled={!canApplyUpdate || isCheckingUpdate || isApplyingUpdate}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isApplyingUpdate ? '更新中' : '更新'}
                    </button>
                  </div>
                </div>
              </div>

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
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          index === 1 ? 'bg-gray-400/20 text-gray-400' :
                          index === 2 ? 'bg-orange-500/20 text-orange-400' :
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
