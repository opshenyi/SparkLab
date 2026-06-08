'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { adminAPI } from '@/lib/api';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';

type LocalStatus = {
  checkedAt?: string;
  docker?: {
    id?: string;
    name?: string;
    host?: string;
    status?: string;
    version?: string;
    operatingSystem?: string;
    kernelVersion?: string;
    architecture?: string;
    containers?: number;
    containersRunning?: number;
    images?: number;
    networks?: number;
    volumes?: number;
  };
  host?: {
    name?: string;
    operatingSystem?: string;
    kernelVersion?: string;
    architecture?: string;
    dockerVersion?: string;
    bootTime?: number;
    uptime?: number;
  };
  resource?: {
    cpuUsage?: number;
    cpuCores?: number;
    cpuModel?: string;
    loadAvg1?: number;
    loadAvg5?: number;
    loadAvg15?: number;
    memoryTotal?: number;
    memoryUsed?: number;
    memoryUsage?: number;
    diskTotal?: number;
    diskUsed?: number;
    diskUsage?: number;
  };
  network?: {
    bytesSent?: number;
    bytesRecv?: number;
  };
};

export default function LocalServerDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [status, setStatus] = useState<LocalStatus | null>(null);
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

  const isAdminOrAuthor = isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR');

  useEffect(() => {
    if (isAdminOrAuthor) {
      void loadStatus();
    }
  }, [isAdminOrAuthor]);

  usePollWhileVisible(isAdminOrAuthor, () => void loadStatus(false), 5000, true);

  const loadStatus = async (showLoading = true) => {
    if (showLoading) setDataLoading(true);
    try {
      const res = await adminAPI.localStatus();
      setStatus(res.data);
    } catch (error) {
      console.error('Failed to load local server dashboard:', error);
      setStatus(null);
    } finally {
      if (showLoading) setDataLoading(false);
    }
  };

  if (isLoading || isLoggingOut) {
    return <LoadingBar text={isLoggingOut ? '退出中' : undefined} />;
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'AUTHOR')) {
    return null;
  }

  const dockerOnline = status?.docker?.status === 'online';
  const loadPercent = clamp(((status?.resource?.loadAvg1 || 0) / Math.max(status?.resource?.cpuCores || 1, 1)) * 100);
  const cpuPercent = clamp(status?.resource?.cpuUsage || 0);
  const memoryPercent = clamp(status?.resource?.memoryUsage || 0);
  const diskPercent = clamp(status?.resource?.diskUsage || 0);

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar />

      <main className="flex min-h-screen flex-1 flex-col pt-16 lg:ml-64 lg:pt-0">
        <div className="flex-1 p-8 lg:p-10">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="mb-2 font-headline text-4xl font-extrabold tracking-tight text-page-title">
                服务器管理
              </h2>
              <p className="text-lg text-on-surface-variant">
                当前主机仪表盘，Docker 通过 unix:///var/run/docker.sock 连接
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-95"
            >
              刷新
            </button>
          </div>

          {dataLoading ? (
            <div className="py-16 text-center text-on-surface-variant">加载当前服务器状态中...</div>
          ) : !status ? (
            <div className="app-card p-8 text-center text-on-surface-variant">
              未读取到当前服务器状态
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6">
                <section className="grid gap-4 md:grid-cols-4">
                  <OverviewCard
                    label="主机名称"
                    value={status.host?.name || status.docker?.name || '当前主机'}
                    subValue={dockerOnline ? 'Docker 在线' : 'Docker 不可用'}
                    good={dockerOnline}
                  />
                  <OverviewCard
                    label="CPU"
                    value={`${status.resource?.cpuCores || 0} 核`}
                    subValue={status.resource?.cpuModel || status.host?.architecture || '-'}
                  />
                  <OverviewCard
                    label="内存"
                    value={formatBytes(status.resource?.memoryTotal)}
                    subValue={`${formatBytes(status.resource?.memoryUsed)} 已用`}
                  />
                  <OverviewCard
                    label="Docker"
                    value={status.docker?.version || '-'}
                    subValue={status.docker?.host || 'unix:///var/run/docker.sock'}
                  />
                </section>

                <section className="app-card p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <h3 className="text-xl font-bold text-page-title">状态</h3>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    <RingGauge label="负载" value={loadPercent} detail={`1 分钟 ${formatNumber(status.resource?.loadAvg1)}`} />
                    <RingGauge label="CPU" value={cpuPercent} detail={`${formatNumber(status.resource?.cpuUsage)}%`} />
                    <RingGauge
                      label="内存"
                      value={memoryPercent}
                      detail={`${formatBytes(status.resource?.memoryUsed)} / ${formatBytes(status.resource?.memoryTotal)}`}
                    />
                    <RingGauge
                      label="磁盘"
                      value={diskPercent}
                      detail={`${formatBytes(status.resource?.diskUsed)} / ${formatBytes(status.resource?.diskTotal)}`}
                    />
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-4">
                  <DockerMetric label="容器" value={`${status.docker?.containersRunning || 0}/${status.docker?.containers || 0}`} />
                  <DockerMetric label="镜像" value={status.docker?.images || 0} />
                  <DockerMetric label="网络" value={status.docker?.networks || 0} />
                  <DockerMetric label="存储卷" value={status.docker?.volumes || 0} />
                </section>
              </div>

              <aside className="space-y-6">
                <section className="app-card p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <h3 className="text-xl font-bold text-page-title">系统信息</h3>
                  </div>
                  <InfoRow label="发行版本" value={status.host?.operatingSystem || status.docker?.operatingSystem || '-'} />
                  <InfoRow label="内核版本" value={status.host?.kernelVersion || status.docker?.kernelVersion || '-'} />
                  <InfoRow label="系统类型" value={status.host?.architecture || status.docker?.architecture || '-'} />
                  <InfoRow label="Docker 地址" value={status.docker?.host || 'unix:///var/run/docker.sock'} mono />
                  <InfoRow label="启动时间" value={formatBootTime(status.host?.bootTime)} />
                  <InfoRow label="运行时间" value={formatUptime(status.host?.uptime)} />
                </section>

                <section className="app-card p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <h3 className="text-xl font-bold text-page-title">流量</h3>
                  </div>
                  <InfoRow label="总发送" value={formatBytes(status.network?.bytesSent)} />
                  <InfoRow label="总接收" value={formatBytes(status.network?.bytesRecv)} />
                  <InfoRow label="Load 5" value={formatNumber(status.resource?.loadAvg5)} />
                  <InfoRow label="Load 15" value={formatNumber(status.resource?.loadAvg15)} />
                </section>
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  subValue,
  good,
}: {
  label: string;
  value: string;
  subValue: string;
  good?: boolean;
}) {
  return (
    <div className="app-card p-5">
      {good !== undefined ? (
        <div className="mb-4 flex items-center justify-end">
          <span className={`h-2.5 w-2.5 rounded-full ${good ? 'bg-status-success' : 'bg-status-error'}`} />
        </div>
      ) : null}
      <p className="mb-1 text-xs text-on-surface-variant">{label}</p>
      <p className="truncate text-xl font-bold text-on-surface" title={value}>{value}</p>
      <p className="mt-1 truncate text-xs text-on-surface-variant" title={subValue}>{subValue}</p>
    </div>
  );
}

function RingGauge({ label, value, detail }: { label: string; value: number; detail: string }) {
  const pct = clamp(value);
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="relative flex h-32 w-32 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(#3b82f6 ${pct}%, rgba(148, 163, 184, 0.16) 0)` }}
      >
        <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-background">
          <span className="text-2xl font-bold tabular-nums text-on-surface">{pct.toFixed(1)}%</span>
          <span className="text-sm text-on-surface-variant">{label}</span>
        </div>
      </div>
      <p className="mt-3 text-sm text-on-surface-variant">{detail}</p>
    </div>
  );
}

function DockerMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="app-card p-5">
      <p className="mb-1 text-xs text-on-surface-variant">{label}</p>
      <p className="text-3xl font-bold tabular-nums text-on-surface">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4 border-b border-outline-variant/30 py-3 last:border-b-0">
      <span className="w-20 shrink-0 text-sm text-on-surface-variant">{label}</span>
      <span className={`min-w-0 flex-1 break-words text-sm text-on-surface ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function formatBootTime(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString('zh-CN');
}

function formatUptime(value?: number) {
  if (!value) return '-';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${days}天 ${hours}小时 ${minutes}分钟`;
}
