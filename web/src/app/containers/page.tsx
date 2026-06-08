'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { containerAPI } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';

interface ContainerData {
  id: string;
  containerId: string;
  labId: string;
  serverId: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  lastActiveAt: number;
  autoStopAt?: number;
  lab?: {
    id: string;
    title: string;
    type?: string;
  };
}

export default function ContainersPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [operatingContainers, setOperatingContainers] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadContainers = useCallback(async () => {
    try {
      const res = await containerAPI.getAll();
      setContainers(res.data);
    } catch (error) {
      console.error('Failed to load containers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  usePollWhileVisible(isAuthenticated, loadContainers, 10_000);

  const handleStart = async (id: string) => {
    setOperatingContainers(prev => new Set(prev).add(id));
    try {
      await containerAPI.start(id);
      await loadContainers();
    } catch (error: any) {
      alert(`启动容器失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setOperatingContainers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleStop = async (id: string) => {
    if (!confirm('确定要停止此容器吗？')) return;
    setOperatingContainers(prev => new Set(prev).add(id));
    try {
      await containerAPI.stop(id);
      await loadContainers();
    } catch (error: any) {
      alert(`停止容器失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setOperatingContainers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('确定要删除此容器吗？此操作不可恢复！')) return;
    setOperatingContainers(prev => new Set(prev).add(id));
    try {
      await containerAPI.remove(id);
      await loadContainers();
    } catch (error: any) {
      alert(`删除容器失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setOperatingContainers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleGoToLab = (labId: string) => {
    router.push(`/lab/${labId}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-status-success-bg text-status-success-text';
      case 'creating':
        return 'bg-status-info-bg text-status-info-text';
      case 'stopped':
        return 'bg-status-neutral-bg text-status-neutral-text';
      case 'error':
        return 'bg-status-error-bg text-status-error-text';
      default:
        return 'bg-surface-container text-on-surface-variant';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running':
        return '运行中';
      case 'creating':
        return '创建中';
      case 'stopped':
        return '已停止';
      case 'error':
        return '错误';
      default:
        return status;
    }
  };

  const formatTime = (time: number) => {
    if (!time || time === 0) return '-';
    // 如果时间戳小于 10000000000，说明是秒级时间戳，需要转换为毫秒
    const timestamp = time < 10000000000 ? time * 1000 : time;
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading || loading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <Sidebar />

      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className="p-8 flex-1">
          <div className="mb-10">
            <h2 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-2">
              我的容器
            </h2>
            <p className="text-on-surface-variant text-lg">
              管理你的实验容器实例
            </p>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-on-surface-variant text-sm mb-1">总容器数</p>
                  <p className="text-3xl font-bold text-primary">{containers.length}</p>
                </div>
              </div>
            </div>

            <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-on-surface-variant text-sm mb-1">运行中</p>
                  <p className="text-3xl font-bold text-status-success-text">
                    {containers.filter(c => c.status === 'running').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-on-surface-variant text-sm mb-1">已停止</p>
                  <p className="text-3xl font-bold text-on-surface-variant">
                    {containers.filter(c => c.status === 'stopped').length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 容器列表 */}
          {containers.length === 0 ? (
            <div className="app-card p-12 text-center">
              <p className="text-on-surface-variant text-lg mb-2">暂无容器</p>
              <p className="text-on-surface-variant/70 text-sm mb-6">
                前往课程中心开始实验，系统会自动为你创建容器
              </p>
              <button
                onClick={() => router.push('/explore')}
                className="px-6 py-3 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all"
              >
                浏览课程
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {containers.map((container) => (
                <div
                  key={container.id}
                  className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* 左侧信息 */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-page-title text-lg font-bold">
                              {container.lab?.title || '未知实验'}
                            </h3>
                            {/* 类型标签 */}
                            {container.lab?.type && (
                              <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">
                                {container.lab.type === 'video' ? '视频' : 
                                 container.lab.type === 'exam' ? '试卷' : '实验'}
                              </span>
                            )}
                            <span className={`px-3 py-1 rounded-full text-xs ${getStatusColor(container.status)}`}>
                              {getStatusText(container.status)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-on-surface-variant">
                          <span>容器ID: </span>
                          <span className="font-mono text-primary">{container.containerId?.slice(0, 12) || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant">
                          <span>创建: {formatTime(container.createdAt)}</span>
                        </div>
                        {container.lastActiveAt && (
                          <div className="flex items-center gap-2 text-on-surface-variant">
                            <span>活跃: {formatTime(container.lastActiveAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 右侧操作按钮 */}
                    <div className="flex lg:flex-col gap-2 lg:min-w-[120px]">
                      <button
                        onClick={() => {
                          const labType = container.lab?.type || 'lab';
                          const url = labType === 'video' ? `/video/${container.labId}` :
                                     labType === 'exam' ? `/exam/${container.labId}` :
                                     `/lab/${container.labId}`;
                          router.push(url);
                        }}
                        disabled={operatingContainers.has(container.id)}
                        className="flex-1 lg:flex-none px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {container.lab?.type === 'video' ? '观看视频' :
                         container.lab?.type === 'exam' ? '答题' : '进入实验'}
                      </button>

                      {container.status === 'running' ? (
                        <button
                          onClick={() => handleStop(container.id)}
                          disabled={operatingContainers.has(container.id)}
                          className="flex-1 lg:flex-none px-4 py-2 bg-surface-container text-on-surface rounded-lg hover:bg-surface-high transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {operatingContainers.has(container.id) ? (
                            <>停止中</>
                          ) : (
                            <>停止</>
                          )}
                        </button>
                      ) : container.status === 'stopped' || container.status === 'error' ? (
                        <button
                          onClick={() => handleStart(container.id)}
                          disabled={operatingContainers.has(container.id)}
                          className="flex-1 lg:flex-none px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {operatingContainers.has(container.id) ? (
                            <>启动中</>
                          ) : (
                            <>启动</>
                          )}
                        </button>
                      ) : container.status === 'creating' ? (
                        <button
                          disabled
                          className="flex-1 lg:flex-none px-4 py-2 bg-surface-container text-on-surface-variant rounded-lg flex items-center justify-center gap-2 text-sm cursor-not-allowed"
                        >
                          创建中
                        </button>
                      ) : null}

                      <button
                        onClick={() => handleRemove(container.id)}
                        disabled={operatingContainers.has(container.id)}
                        className="flex-1 lg:flex-none px-4 py-2 bg-status-error-bg text-status-error-text rounded-lg hover:opacity-85 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {operatingContainers.has(container.id) ? (
                          <>删除中</>
                        ) : (
                          <>删除</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
