'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/useAuthStore';
import { adminAPI } from '@/lib/api';
import api from '@/lib/api';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';
import AdminSidebar from '@/components/AdminSidebar';
import { AdminNoServersPrompt } from '@/components/AdminNoServersPrompt';
import LoadingBar from '@/components/LoadingBar';

const ContainerTerminal = dynamic(() => import('@/components/ContainerTerminal'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="text-white">加载终端...</div>
    </div>
  ),
});

type LocalDockerNode = {
  id: string;
  name: string;
  host: string;
  status: string;
};

type DockerContainer = {
  id: string;
  name?: string;
  image?: string;
  status: string;
  created?: string;
  ports?: unknown;
};

type LabContainer = {
  id: string;
  serverId?: string;
  containerId?: string;
  status: string;
  createdAt?: number | string;
  user?: {
    displayName?: string;
    username?: string;
  };
  lab?: {
    title?: string;
  };
};

type DisplayContainer = {
  id: string;
  dockerId: string;
  name: string;
  title: string;
  subtitle: string;
  image?: string;
  status: string;
  createdAt?: number | string;
  type: 'lab' | 'system';
};

const statusText: Record<string, string> = {
  running: '运行中',
  creating: '创建中',
  created: '已创建',
  stopped: '已停止',
  exited: '已退出',
  paused: '已暂停',
  restarting: '重启中',
  removing: '删除中',
  dead: '异常',
  error: '错误',
};

export default function AdminContainersPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [node, setNode] = useState<LocalDockerNode | null>(null);
  const [containers, setContainers] = useState<DisplayContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState<Set<string>>(new Set());
  const [terminalContainer, setTerminalContainer] = useState<{
    containerId: string;
    containerName: string;
  } | null>(null);

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

  const isAdminOrAuthor = isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR');

  useEffect(() => {
    if (isAdminOrAuthor) {
      void loadData();
    }
  }, [isAdminOrAuthor]);

  usePollWhileVisible(isAdminOrAuthor, () => void loadData(false), 5000, true);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: serverData } = await api.get('/servers');
      const localNode = Array.isArray(serverData) ? serverData[0] : null;
      setNode(localNode || null);

      if (!localNode || localNode.status !== 'online') {
        setContainers([]);
        return;
      }

      const [dockerRes, dbRes] = await Promise.all([
        api.get(`/servers/${localNode.id}/containers`),
        adminAPI.getAllContainers(),
      ]);
      const dockerContainers = (dockerRes.data?.containers || []) as DockerContainer[];
      const labContainers = (dbRes.data || []) as LabContainer[];
      const labDockerIds = new Set(labContainers.map((c) => c.containerId).filter(Boolean));

      const labs: DisplayContainer[] = labContainers.map((c) => ({
        id: c.id,
        dockerId: c.containerId || '',
        name: c.containerId ? c.containerId.slice(0, 12) : c.id.slice(0, 12),
        title: c.lab?.title || '实验容器',
        subtitle: c.user?.displayName || c.user?.username || '未知用户',
        status: c.status,
        createdAt: c.createdAt,
        type: 'lab',
      }));

      const systems: DisplayContainer[] = dockerContainers
        .filter((c) => !labDockerIds.has(c.id))
        .map((c) => ({
          id: c.id,
          dockerId: c.id,
          name: c.name || c.id.slice(0, 12),
          title: c.name || c.id.slice(0, 12),
          subtitle: c.image || 'Docker 容器',
          image: c.image,
          status: c.status,
          createdAt: c.created,
          type: 'system',
        }));

      setContainers([...labs, ...systems]);
    } catch (error) {
      console.error('Failed to load local Docker containers:', error);
      setNode(null);
      setContainers([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const operate = async (key: string, action: () => Promise<void>) => {
    setOperating((prev) => new Set(prev).add(key));
    try {
      await action();
      await loadData(false);
    } finally {
      setOperating((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const startContainer = async (c: DisplayContainer) => {
    if (c.type === 'lab') {
      await operate(c.id, () => api.post(`/containers/${c.id}/start`));
      return;
    }
    if (!node) return;
    await operate(c.id, () => api.post(`/servers/${node.id}/containers/${c.dockerId}/start`));
  };

  const stopContainer = async (c: DisplayContainer) => {
    if (!window.confirm('确定要停止此容器吗？')) return;
    if (c.type === 'lab') {
      await operate(c.id, () => api.post(`/containers/${c.id}/stop`));
      return;
    }
    if (!node) return;
    await operate(c.id, () => api.post(`/servers/${node.id}/containers/${c.dockerId}/stop`));
  };

  const removeContainer = async (c: DisplayContainer) => {
    if (!window.confirm('确定要删除此容器吗？此操作不可恢复。')) return;
    if (c.type === 'lab') {
      await operate(c.id, () => api.delete(`/containers/${c.id}`));
      return;
    }
    if (!node) return;
    await operate(c.id, () => api.delete(`/servers/${node.id}/containers/${c.dockerId}`));
  };

  const formatTime = (value?: number | string) => {
    if (!value) return '-';
    if (typeof value === 'string' && Number.isNaN(Number(value))) {
      return new Date(value).toLocaleString('zh-CN');
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '-';
    const ms = num < 10_000_000_000 ? num * 1000 : num;
    return new Date(ms).toLocaleString('zh-CN');
  };

  if (isLoading || isLoggingOut) {
    return <LoadingBar text={isLoggingOut ? '退出中' : undefined} />;
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'AUTHOR')) {
    return null;
  }

  const online = node?.status === 'online';
  const labCount = containers.filter((c) => c.type === 'lab').length;
  const systemCount = containers.length - labCount;

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar />

      <main className="flex min-h-screen flex-1 flex-col pt-16 lg:ml-64 lg:pt-0">
        <div className="flex-1 p-8">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="mb-2 font-headline text-4xl font-extrabold tracking-tight text-page-title">
                本机 Docker 容器
              </h2>
              <p className="text-lg text-on-surface-variant">
                仅通过 unix:///var/run/docker.sock 管理当前主机的容器
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-95"
            >
              刷新
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-on-surface-variant">加载本机 Docker 容器中...</div>
          ) : !online ? (
            <AdminNoServersPrompt context="本机 Docker 容器" />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard label="实验容器" value={labCount} />
                <SummaryCard label="系统容器" value={systemCount} />
                <SummaryCard label="运行中" value={containers.filter((c) => c.status === 'running').length} />
              </div>

              <div className="app-card overflow-hidden">
                <div className="border-b border-outline-variant/40 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-page-title">容器列表</h3>
                    <span className="text-sm text-on-surface-variant">{node?.name || '本机 Docker'}</span>
                  </div>
                </div>

                {containers.length === 0 ? (
                  <div className="p-10 text-center text-on-surface-variant">暂无容器</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px]">
                      <thead className="bg-surface-container">
                        <tr>
                          <th className="p-3 text-left text-sm font-medium text-on-surface-variant">类型</th>
                          <th className="p-3 text-left text-sm font-medium text-on-surface-variant">容器</th>
                          <th className="p-3 text-left text-sm font-medium text-on-surface-variant">实验/镜像</th>
                          <th className="p-3 text-left text-sm font-medium text-on-surface-variant">状态</th>
                          <th className="p-3 text-left text-sm font-medium text-on-surface-variant">创建时间</th>
                          <th className="p-3 text-left text-sm font-medium text-on-surface-variant">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {containers.map((c) => {
                          const isBusy = operating.has(c.id);
                          return (
                            <tr key={`${c.type}-${c.id}`} className="border-t border-outline-variant/30 transition-colors hover:bg-surface-container">
                              <td className="p-3">
                                <span className={`rounded px-2 py-1 text-xs ${c.type === 'lab' ? 'bg-primary/15 text-primary' : 'bg-blue-400/15 text-blue-400'}`}>
                                  {c.type === 'lab' ? '实验' : '系统'}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="max-w-[180px] truncate text-sm font-semibold text-on-surface" title={c.name}>
                                  {c.name}
                                </div>
                                <div className="max-w-[180px] truncate font-mono text-xs text-on-surface-variant" title={c.dockerId}>
                                  {c.dockerId ? c.dockerId.slice(0, 12) : '-'}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="max-w-[260px] truncate text-sm text-on-surface" title={c.title}>
                                  {c.title}
                                </div>
                                <div className="max-w-[260px] truncate text-xs text-on-surface-variant" title={c.subtitle}>
                                  {c.subtitle}
                                </div>
                              </td>
                              <td className="p-3">
                                <span className={`rounded px-2 py-1 text-xs ${
                                  c.status === 'running'
                                    ? 'bg-status-success-bg text-status-success-text'
                                    : c.status === 'error' || c.status === 'dead'
                                      ? 'bg-status-error-bg text-status-error-text'
                                      : 'bg-status-neutral-bg text-status-neutral-text'
                                }`}>
                                  {statusText[c.status] || c.status}
                                </span>
                              </td>
                              <td className="p-3 text-sm text-on-surface-variant">{formatTime(c.createdAt)}</td>
                              <td className="p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  {isBusy ? (
                                    <span className="text-sm text-on-surface-variant">处理中</span>
                                  ) : (
                                    <>
                                      {c.status === 'running' && c.dockerId ? (
                                        <button
                                          type="button"
                                          onClick={() => setTerminalContainer({ containerId: c.dockerId, containerName: c.title })}
                                          className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-high"
                                          title="打开终端"
                                        >
                                          终端
                                        </button>
                                      ) : null}
                                      {c.status === 'running' ? (
                                        <button
                                          type="button"
                                          onClick={() => void stopContainer(c)}
                                          className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-high"
                                          title="停止容器"
                                        >
                                          停止
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => void startContainer(c)}
                                          className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-opacity hover:opacity-90"
                                          title="启动容器"
                                        >
                                          启动
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => void removeContainer(c)}
                                        className="rounded-full bg-status-error-bg px-3 py-1.5 text-xs font-medium text-status-error-text transition-opacity hover:opacity-85"
                                        title="删除容器"
                                      >
                                        删除
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {node && terminalContainer ? (
        <ContainerTerminal
          serverId={node.id}
          containerId={terminalContainer.containerId}
          containerName={terminalContainer.containerName}
          onClose={() => setTerminalContainer(null)}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="app-card p-5">
      <p className="mb-1 text-sm text-on-surface-variant">{label}</p>
      <p className="text-3xl font-bold tabular-nums text-primary">{value}</p>
    </div>
  );
}
