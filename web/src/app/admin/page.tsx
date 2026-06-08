'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { adminAPI } from '@/lib/api';
import Sidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';
import { CheckCircle2, DownloadCloud, GitBranch, Loader2, RefreshCw } from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [stats, setStats] = useState<any>({});
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);

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
    }
  }, [isAuthenticated, user]);

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

  const applyUpdate = async () => {
    if (!window.confirm('确认从 GitHub 拉取更新？更新完成后需要重启服务。')) return;
    setIsApplyingUpdate(true);
    setUpdateMessage('');
    try {
      const res = await adminAPI.applyUpdate();
      setUpdateMessage(res.data?.message || '更新完成');
      await checkUpdates();
    } catch (error: any) {
      setUpdateMessage(error?.response?.data?.message || '执行更新失败');
    } finally {
      setIsApplyingUpdate(false);
    }
  };

  const getQQAvatar = (qqNumber?: string) => {
    if (!qqNumber) return null;
    return `http://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
  };

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
                      <GitBranch className="h-5 w-5" />
                      <h3 className="font-display text-page-title text-xl font-bold tracking-tight">系统更新</h3>
                    </div>
                    <div className="grid gap-2 text-sm text-on-surface-variant sm:grid-cols-2">
                      <div className="min-w-0">
                        <span className="font-medium text-on-surface">当前</span>{' '}
                        {updateInfo?.currentCommit ? updateInfo.currentCommit.slice(0, 12) : '未检查'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-on-surface">GitHub</span>{' '}
                        {updateInfo?.latestCommit ? updateInfo.latestCommit.slice(0, 12) : '未检查'}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      {updateInfo?.hasUpdate ? (
                        <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">发现更新</span>
                      ) : updateInfo ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/10 px-3 py-1 font-medium text-status-success">
                          <CheckCircle2 className="h-4 w-4" />
                          已是最新
                        </span>
                      ) : null}
                      {updateInfo?.dirty && (
                        <span className="rounded-full bg-status-warning/10 px-3 py-1 font-medium text-status-warning">
                          存在本地改动
                        </span>
                      )}
                      {updateMessage && <span className="text-on-surface-variant">{updateMessage}</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={checkUpdates}
                      disabled={isCheckingUpdate || isApplyingUpdate}
                      className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCheckingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      检查
                    </button>
                    <button
                      type="button"
                      onClick={applyUpdate}
                      disabled={!updateInfo?.hasUpdate || !updateInfo?.canApply || isCheckingUpdate || isApplyingUpdate}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isApplyingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                      更新
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
                      查看全部 →
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
                      查看全部 →
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
