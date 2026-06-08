'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Cpu, HardDrive, RefreshCw, Server as ServerIcon } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';

interface LocalDockerInfo {
  id: string;
  name: string;
  host: string;
  status: string;
  maxContainers: number;
  activeContainers: number;
  totalContainers?: number;
  cpuUsage: number;
  memoryUsage: number;
  cpuCores: number;
  cpuModel?: string;
  totalMemory: number;
  lastCheckAt: number | string;
}

export default function LocalDockerPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [node, setNode] = useState<LocalDockerInfo | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

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
      void loadLocalDocker();
    }
  }, [isAuthenticated, user]);

  const loadLocalDocker = async () => {
    setDataLoading(true);
    try {
      const { data } = await api.get('/servers');
      const list = Array.isArray(data) ? data : [];
      setNode(list[0] || null);
    } catch (error) {
      console.error('Failed to load local Docker status:', error);
      setNode(null);
    } finally {
      setDataLoading(false);
    }
  };

  if (isLoading || isLoggingOut) {
    return <LoadingBar text={isLoggingOut ? '退出中' : undefined} />;
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'AUTHOR')) {
    return null;
  }

  const online = node?.status === 'online';

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar />
      <main className="flex min-h-screen flex-1 flex-col pt-16 lg:ml-64 lg:pt-0">
        <div className="flex-1 p-8">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="mb-2 font-headline text-4xl font-extrabold tracking-tight text-page-title">
                本机 Docker
              </h2>
              <p className="text-lg text-on-surface-variant">
                SparkLab 只使用本机 Docker socket：unix:///var/run/docker.sock
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadLocalDocker()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-95"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>

          {dataLoading ? (
            <div className="py-16 text-center text-on-surface-variant">加载本机 Docker 状态中...</div>
          ) : !node ? (
            <div className="app-card p-8 text-center text-on-surface-variant">
              未读取到本机 Docker 状态。请查看后端日志确认 Docker socket 挂载是否正常。
            </div>
          ) : (
            <div className="space-y-6">
              <div className="app-card p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
                    <ServerIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-xl font-bold text-page-title">{node.name || '本机 Docker'}</h3>
                      <span
                        className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
                      />
                      <span className={online ? 'text-sm text-green-500' : 'text-sm text-red-500'}>
                        {online ? '在线' : '不可用'}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-on-surface-variant">{node.host}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                  icon={<Activity className="h-4 w-4 text-primary" />}
                  label="容器"
                  value={`${node.activeContainers || 0}/${node.totalContainers || node.maxContainers || 0}`}
                />
                <MetricCard
                  icon={<Cpu className="h-4 w-4 text-primary" />}
                  label="CPU"
                  value={`${Number(node.cpuUsage || 0).toFixed(1)}%`}
                />
                <MetricCard
                  icon={<HardDrive className="h-4 w-4 text-primary" />}
                  label="内存"
                  value={`${Number(node.memoryUsage || 0).toFixed(1)}%`}
                />
                <MetricCard
                  icon={<ServerIcon className="h-4 w-4 text-primary" />}
                  label="规格"
                  value={`${node.cpuCores || 0} 核 / ${node.totalMemory || 0} MB`}
                />
              </div>

              <div className="app-card p-5 text-sm text-on-surface-variant">
                <p>现在不需要添加服务器，也不需要开放 tcp://0.0.0.0:2375。</p>
                <p className="mt-2">
                  如果状态不可用，请确认宿主机 Docker 正在运行，并且 compose 已挂载
                  <span className="mx-1 font-mono text-on-surface">/var/run/docker.sock</span>。
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="app-card p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="text-xs text-on-surface-variant">{label}</p>
      </div>
      <p className="text-2xl font-bold text-primary">{value}</p>
    </div>
  );
}
