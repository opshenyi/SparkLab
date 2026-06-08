'use client';

import { useEffect, useRef, useState } from 'react';
import { monitorAPI } from '@/lib/api';

interface ResourceStats {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  memoryUsed: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  cpuCores: number;
  timestamp: string;
}

export default function ResourceMonitor() {
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsOpenRef = useRef(false);
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const stopPoll = () => {
      if (pollIdRef.current !== null) {
        clearInterval(pollIdRef.current);
        pollIdRef.current = null;
      }
    };

    const pollStats = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const response = await monitorAPI.getResourceStats();
        setStats(response.data);
        setLoading(false);
        setError(null);
      } catch {
        setError('资源数据读取失败');
        setLoading(false);
      }
    };

    const startPollFallback = () => {
      stopPoll();
      if (wsOpenRef.current) return;
      void pollStats();
      pollIdRef.current = setInterval(() => void pollStats(), 5000);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopPoll();
        return;
      }
      if (!wsOpenRef.current) startPollFallback();
    };

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/server/monitor/resources/stream?interval=2`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        wsOpenRef.current = true;
        stopPoll();
        setLoading(false);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          setStats(JSON.parse(event.data));
        } catch {
          console.error('Failed to parse stats');
        }
      };

      ws.onerror = () => {
        setError('资源流连接失败，已切换轮询');
        wsOpenRef.current = false;
        startPollFallback();
      };

      ws.onclose = () => {
        wsOpenRef.current = false;
        startPollFallback();
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      };
    };

    connectWebSocket();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopPoll();
      ws?.close();
      clearTimeout(reconnectTimeout);
      wsOpenRef.current = false;
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const usageClass = (usage: number) => {
    if (usage < 50) return 'bg-status-success';
    if (usage < 80) return 'bg-status-warning';
    return 'bg-status-error';
  };

  const meter = (label: string, value: number, detail?: string) => (
    <div>
      <div className="mb-1 flex justify-between gap-4 text-sm text-on-surface-variant">
        <span>{label}</span>
        <span className="tabular-nums text-on-surface">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
        <div className={`h-2 rounded-full transition-all ${usageClass(value)}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      {detail ? <p className="mt-1 text-xs text-on-surface-variant">{detail}</p> : null}
    </div>
  );

  if (loading) {
    return (
      <div className="app-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-surface-container" />
          <div className="h-8 rounded bg-surface-container" />
          <div className="h-8 rounded bg-surface-container" />
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="app-card p-6">
        <p className="text-sm text-status-error-text">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="app-card p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-on-surface">系统资源</h3>
        {error ? <p className="mt-1 text-xs text-status-warning-text">{error}</p> : null}
      </div>

      <div className="space-y-5">
        {meter('CPU 使用率', stats.cpuUsage, `${stats.cpuCores} 核心`)}
        {meter('内存使用', stats.memoryUsage, `${formatBytes(stats.memoryUsed)} / ${formatBytes(stats.memoryTotal)}`)}

        <div className="grid grid-cols-3 gap-2 text-center text-xs text-on-surface-variant">
          <div className="rounded-md bg-surface-container px-2 py-3">
            <div className="font-mono text-sm text-on-surface">{stats.loadAvg1.toFixed(2)}</div>
            <div className="mt-1">Load 1m</div>
          </div>
          <div className="rounded-md bg-surface-container px-2 py-3">
            <div className="font-mono text-sm text-on-surface">{stats.loadAvg5.toFixed(2)}</div>
            <div className="mt-1">Load 5m</div>
          </div>
          <div className="rounded-md bg-surface-container px-2 py-3">
            <div className="font-mono text-sm text-on-surface">{stats.loadAvg15.toFixed(2)}</div>
            <div className="mt-1">Load 15m</div>
          </div>
        </div>

        <p className="text-xs text-on-surface-variant">更新：{new Date(stats.timestamp).toLocaleString()}</p>
      </div>
    </div>
  );
}
