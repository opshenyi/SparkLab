'use client';

import { useState } from 'react';
import { monitorAPI } from '@/lib/api';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';

interface DockerContainer {
  id: string;
  name: string[];
  image: string;
  status: string;
  state: string;
  created: number;
  ports: any[];
}

const stateBadgeClass = (state: string) => {
  switch (state.toLowerCase()) {
    case 'running':
      return 'bg-status-success-bg text-status-success-text';
    case 'exited':
      return 'bg-status-error-bg text-status-error-text';
    case 'paused':
      return 'bg-status-warning-bg text-status-warning-text';
    default:
      return 'bg-status-neutral-bg text-status-neutral-text';
  }
};

export default function DockerContainerManager() {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchContainers = async () => {
    try {
      const response = await monitorAPI.getDockerContainers();
      setContainers(response.data.containers || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || '容器列表读取失败');
    } finally {
      setLoading(false);
    }
  };

  usePollWhileVisible(true, fetchContainers, 5000);

  const handleAction = async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(containerId);
    try {
      if (action === 'start') {
        await monitorAPI.startContainer(containerId);
      } else if (action === 'stop') {
        await monitorAPI.stopContainer(containerId);
      } else {
        await monitorAPI.restartContainer(containerId);
      }
      await fetchContainers();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失败，请稍后再试');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="app-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/4 rounded bg-surface-container" />
          <div className="h-16 rounded bg-surface-container" />
          <div className="h-16 rounded bg-surface-container" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card p-6">
        <h2 className="mb-3 text-lg font-semibold text-on-surface">Docker 容器</h2>
        <p className="text-sm text-status-error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Docker 容器</h2>
          <p className="mt-1 text-sm text-on-surface-variant">本机运行实例与基础操作</p>
        </div>
        <button
          onClick={fetchContainers}
          className="rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-high"
        >
          刷新
        </button>
      </div>

      {containers.length === 0 ? (
        <div className="rounded-lg bg-surface-container/50 py-10 text-center text-sm text-on-surface-variant">
          暂无容器
        </div>
      ) : (
        <div className="space-y-3">
          {containers.map((container) => {
            const busy = actionLoading === container.id;
            const running = container.state.toLowerCase() === 'running';
            return (
              <div key={container.id} className="rounded-lg bg-surface-low p-4 shadow-[var(--shadow-ring)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-on-surface">
                        {container.name[0] || container.id}
                      </h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stateBadgeClass(container.state)}`}>
                        {container.state}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-on-surface-variant">
                      <p className="break-all font-mono text-xs">ID: {container.id}</p>
                      <p className="break-all">Image: {container.image}</p>
                      <p>Status: {container.status}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!running ? (
                      <button
                        onClick={() => handleAction(container.id, 'start')}
                        disabled={busy}
                        className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? '启动中' : '启动'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleAction(container.id, 'restart')}
                          disabled={busy}
                          className="rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-high disabled:opacity-50"
                        >
                          {busy ? '重启中' : '重启'}
                        </button>
                        <button
                          onClick={() => handleAction(container.id, 'stop')}
                          disabled={busy}
                          className="rounded-full bg-status-error-bg px-4 py-2 text-sm font-medium text-status-error-text transition-colors hover:opacity-85 disabled:opacity-50"
                        >
                          {busy ? '停止中' : '停止'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
