'use client';

import { useEffect, useState, useRef } from 'react';
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
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        const response = await monitorAPI.getResourceStats();
        setStats(response.data);
        setLoading(false);
        setError(null);
      } catch {
        setError('Failed to fetch resource stats');
        setLoading(false);
      }
    };

    const startPollFallback = () => {
      stopPoll();
      if (wsOpenRef.current) {
        return;
      }
      void pollStats();
      pollIdRef.current = setInterval(() => void pollStats(), 5000);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopPoll();
        return;
      }
      if (!wsOpenRef.current) {
        startPollFallback();
      }
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
          const data = JSON.parse(event.data);
          setStats(data);
        } catch {
          console.error('Failed to parse stats');
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection failed');
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
      if (ws) {
        ws.close();
      }
      clearTimeout(reconnectTimeout);
      wsOpenRef.current = false;
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getUsageColor = (usage: number) => {
    if (usage < 50) return 'bg-green-500';
    if (usage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-700 rounded mb-2"></div>
          <div className="h-8 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">系统资源</h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm text-gray-300 mb-1">
            <span>CPU 使用率</span>
            <span>{stats.cpuUsage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${getUsageColor(stats.cpuUsage)}`}
              style={{ width: `${Math.min(stats.cpuUsage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{stats.cpuCores} 核心</p>
        </div>

        <div>
          <div className="flex justify-between text-sm text-gray-300 mb-1">
            <span>内存使用</span>
            <span>
              {formatBytes(stats.memoryUsed)} / {formatBytes(stats.memoryTotal)}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${getUsageColor(stats.memoryUsage)}`}
              style={{ width: `${Math.min(stats.memoryUsage, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-400">
          <div>
            <div className="text-white font-mono">{stats.loadAvg1.toFixed(2)}</div>
            <div>Load 1m</div>
          </div>
          <div>
            <div className="text-white font-mono">{stats.loadAvg5.toFixed(2)}</div>
            <div>Load 5m</div>
          </div>
          <div>
            <div className="text-white font-mono">{stats.loadAvg15.toFixed(2)}</div>
            <div>Load 15m</div>
          </div>
        </div>

        <p className="text-xs text-gray-500">更新: {new Date(stats.timestamp).toLocaleString()}</p>
      </div>
    </div>
  );
}
