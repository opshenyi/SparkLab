'use client';

import { useEffect, useState } from 'react';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { adminAPI } from '@/lib/api';
import api from '@/lib/api';
import AdminSidebar from '@/components/AdminSidebar';
import { AdminNoServersPrompt } from '@/components/AdminNoServersPrompt';
import LoadingBar from '@/components/LoadingBar';
import dynamic from 'next/dynamic';
import { Server, Loader2, Terminal } from 'lucide-react';

// Import ContainerTerminal dynamically to avoid SSR issues with xterm
const ContainerTerminal = dynamic(() => import('@/components/ContainerTerminal'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="text-white">加载终端...</div>
  </div>
});

interface ServerInfo {
  id: string;
  name: string;
  status: string;
}

interface Container {
  id: string;
  serverId: string;
  serverName?: string;
  containerId?: string; // Docker 容器 ID
  status: string;
  isDockerContainer?: boolean;
  image?: string;
  name?: string;
  created?: string;
  createdAt?: string;
  ports?: any;
  user?: {
    displayName?: string;
    username?: string;
  };
  lab?: {
    title?: string;
  };
}

export default function AdminContainersPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [containers, setContainers] = useState<Container[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [totalImages, setTotalImages] = useState<number>(0);
  const [usedImages, setUsedImages] = useState<number>(0);
  const [operatingContainers, setOperatingContainers] = useState<Set<string>>(new Set());
  const [terminalContainer, setTerminalContainer] = useState<{
    serverId: string;
    containerId: string;
    containerName: string;
  } | null>(null);
  const [serversDataReady, setServersDataReady] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 状态文本映射函数
  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'running': '运行中',
      'creating': '创建中',
      'created': '已创建',
      'stopped': '已停止',
      'exited': '已退出',
      'paused': '已暂停',
      'restarting': '重启中',
      'removing': '删除中',
      'dead': '已死亡',
      'error': '错误',
    };
    return statusMap[status] || status;
  };

  const formatTime = (time: number | string | undefined) => {
    if (!time) return '-';
    const timeNum = typeof time === 'string' ? parseInt(time) : time;
    if (!timeNum || timeNum === 0) return '-';
    // 如果时间戳小于 10000000000，说明是秒级时间戳，需要转换为毫秒
    const timestamp = timeNum < 10000000000 ? timeNum * 1000 : timeNum;
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    } else if (!isLoading && isAuthenticated && user?.role !== 'ADMIN' && user?.role !== 'AUTHOR') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, user, router]);

  const isAdminOrAuthor =
    isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR');

  useEffect(() => {
    if (isAdminOrAuthor) {
      loadAllData();
    }
  }, [isAuthenticated, user]);

  usePollWhileVisible(isAdminOrAuthor, () => void loadAllData(), 5000, true);

  const loadData = async () => {
    try {
      const res = await adminAPI.getAllContainers();
      // 只在数据真正变化时才更新
      setContainers(prev => {
        const newData = res.data;
        if (JSON.stringify(prev.filter(c => !c.isDockerContainer)) === JSON.stringify(newData)) {
          return prev;
        }
        // 保留 Docker 容器，更新数据库容器
        const dockerContainers = prev.filter(c => c.isDockerContainer);
        return [...newData, ...dockerContainers];
      });
    } catch (error) {
      console.error('Failed to load containers:', error);
    }
  };

  // 优化：一次性加载所有数据，只调用一次 /servers
  const loadAllData = async () => {
    try {
      // 1. 获取服务器列表（只调用一次）
      const { data: serverList } = await api.get('/servers');
      
      // 更新服务器列表
      setServers(prev => {
        if (JSON.stringify(prev) === JSON.stringify(serverList)) {
          return prev;
        }
        return serverList;
      });

      const onlineServers = serverList.filter((s: ServerInfo) => s.status === 'online');
      
      // 2. 并行获取所有在线服务器的容器和镜像
      const [containerResults, imageResults, dbContainersRes] = await Promise.all([
        // 获取所有服务器的容器
        Promise.all(onlineServers.map(async (server: ServerInfo) => {
          try {
            const { data } = await api.get(`/servers/${server.id}/containers`);
            return (data.containers || []).map((c: any) => ({
              id: c.id,
              serverId: server.id,
              serverName: server.name,
              name: c.name,
              image: c.image,
              status: c.status,
              created: c.created,
              ports: c.ports,
              isDockerContainer: true,
            }));
          } catch (error) {
            console.error(`Failed to load containers from ${server.name}:`, error);
            return [];
          }
        })),
        // 获取所有服务器的镜像
        Promise.all(onlineServers.map(async (server: ServerInfo) => {
          try {
            const { data } = await api.get(`/servers/${server.id}/images`);
            return data.images || [];
          } catch (error) {
            console.error(`Failed to load images from ${server.name}:`, error);
            return [];
          }
        })),
        // 获取数据库容器
        adminAPI.getAllContainers()
      ]);

      // 3. 处理容器数据
      const allDockerContainers = containerResults.flat();
      const dbContainers = dbContainersRes.data;
      
      // 创建数据库容器的 containerId 集合（用于过滤）
      const dbContainerIds = new Set(
        dbContainers
          .map((c: Container) => c.containerId)
          .filter((id: string | undefined) => id) // 过滤掉空值
      );
      
      // 过滤系统容器：只保留不在数据库中的容器（真正的系统容器）
      const systemContainers = allDockerContainers.filter(
        (c: Container) => !dbContainerIds.has(c.id)
      );
      
      setContainers(prev => {
        const newContainers = [...dbContainers, ...systemContainers];
        const prevIds = prev.map(c => c.id).sort().join(',');
        const newIds = newContainers.map(c => c.id).sort().join(',');
        if (prevIds === newIds) {
          const prevStatus = prev.map(c => `${c.id}:${c.status}`).sort().join(',');
          const newStatus = newContainers.map(c => `${c.id}:${c.status}`).sort().join(',');
          if (prevStatus === newStatus) {
            return prev;
          }
        }
        return newContainers;
      });

      // 4. 处理镜像数据
      const allImages = imageResults.flat();
      setTotalImages(allImages.length);
      
      const usedImageSet = new Set(systemContainers.map(c => c.image).filter(img => img));
      setUsedImages(usedImageSet.size);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setServersDataReady(true);
    }
  };

  const handleForceStop = async (id: string) => {
    if (!confirm('确定要强制停止此容器吗？')) return;
    try {
      await adminAPI.forceStopContainer(id);
      loadAllData(); // 使用新的统一加载函数
    } catch (error) {
      console.error('Failed to stop container:', error);
    }
  };

  const handleLabContainerStart = async (id: string) => {
    setOperatingContainers(prev => new Set(prev).add(id));
    try {
      await api.post(`/containers/${id}/start`);
      await loadAllData();
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

  const handleLabContainerStop = async (id: string) => {
    if (!confirm('确定要停止此容器吗？')) return;
    setOperatingContainers(prev => new Set(prev).add(id));
    try {
      await api.post(`/containers/${id}/stop`);
      await loadAllData();
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

  const handleLabContainerRemove = async (id: string) => {
    if (!confirm('确定要删除此容器吗？此操作不可恢复！')) return;
    setOperatingContainers(prev => new Set(prev).add(id));
    try {
      await api.delete(`/containers/${id}`);
      await loadAllData();
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

  const handleSystemContainerStart = async (serverId: string, containerId: string) => {
    setOperatingContainers(prev => new Set(prev).add(containerId));
    try {
      await api.post(`/servers/${serverId}/containers/${containerId}/start`);
      await loadAllData();
    } catch (error: any) {
      alert(`启动容器失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setOperatingContainers(prev => {
        const next = new Set(prev);
        next.delete(containerId);
        return next;
      });
    }
  };

  const handleSystemContainerStop = async (serverId: string, containerId: string) => {
    if (!confirm('确定要停止此容器吗？')) return;
    setOperatingContainers(prev => new Set(prev).add(containerId));
    try {
      await api.post(`/servers/${serverId}/containers/${containerId}/stop`);
      await loadAllData();
    } catch (error: any) {
      alert(`停止容器失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setOperatingContainers(prev => {
        const next = new Set(prev);
        next.delete(containerId);
        return next;
      });
    }
  };

  const handleSystemContainerRemove = async (serverId: string, containerId: string) => {
    if (!confirm('确定要删除此容器吗？此操作不可恢复！')) return;
    setOperatingContainers(prev => new Set(prev).add(containerId));
    try {
      await api.delete(`/servers/${serverId}/containers/${containerId}`);
      await loadAllData();
    } catch (error: any) {
      alert(`删除容器失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setOperatingContainers(prev => {
        const next = new Set(prev);
        next.delete(containerId);
        return next;
      });
    }
  };

  const filteredContainers = selectedServer === 'all' 
    ? containers 
    : containers.filter(c => c.serverId === selectedServer);

  // 分离星火实验室容器和系统容器
  const labContainers = filteredContainers.filter(c => !c.isDockerContainer);
  const systemContainers = filteredContainers.filter(c => c.isDockerContainer);

  const getServerName = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    return server?.name || '未知服务器';
  };

  const getServerStatus = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    return server?.status || 'offline';
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
      <AdminSidebar />

      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className="p-8 flex-1">
          <div className="mb-10">
            <h2 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-2">
              容器管理
            </h2>
            <p className="text-on-surface-variant text-lg">
              监控和管理所有服务器上的容器实例
            </p>
          </div>

          {!serversDataReady ? (
            <div className="text-center py-16 text-on-surface-variant">加载资源中...</div>
          ) : servers.length === 0 ? (
            <AdminNoServersPrompt context="容器管理" />
          ) : (
            <>
          {/* 服务器筛选（与镜像/网络等页同一套按钮样式，无图标前缀） */}
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedServer('all')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                selectedServer === 'all'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'admin-control text-on-surface'
              }`}
            >
              全部 ({containers.length})
            </button>
            {servers.map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => setSelectedServer(server.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  selectedServer === server.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'admin-control text-on-surface'
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    server.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                {server.name} ({containers.filter((c) => c.serverId === server.id).length})
              </button>
            ))}
          </div>

          {/* 所有容器统一显示 */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-6 bg-primary rounded-full"></div>
              <h3 className="text-xl font-bold text-page-title">容器列表</h3>
              <span className="text-sm text-on-surface-variant">
                (星火: {labContainers.length} | 系统: {systemContainers.length})
              </span>
            </div>

            {/* 桌面端表格视图 */}
            <div className="hidden lg:block app-card overflow-hidden">
              <table className="w-full">
                <colgroup>
                  <col style={{ width: '8%', minWidth: '70px' }} />
                  <col style={{ width: '8%', minWidth: '70px' }} />
                  <col style={{ width: '12%', minWidth: '100px' }} />
                  <col style={{ width: '12%', minWidth: '100px' }} />
                  <col style={{ width: '20%', minWidth: '150px' }} />
                  <col style={{ width: '8%', minWidth: '70px' }} />
                  <col style={{ width: '14%', minWidth: '110px' }} />
                  <col style={{ width: '18%', minWidth: '140px' }} />
                </colgroup>
                <thead className="bg-surface-container">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">类型</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">容器ID</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">服务器</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">用户/名称</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">实验/镜像</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">状态</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">创建时间</th>
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-on-surface-variant">
                        暂无容器
                      </td>
                    </tr>
                  ) : (
                    containers.map((c) => {
                      const isSparkContainer = !c.isDockerContainer;
                      return (
                        <tr key={c.id} className="hover:bg-surface-container transition-colors">
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs inline-block whitespace-nowrap ${
                              isSparkContainer ? 'bg-primary/20 text-primary' : 'bg-blue-400/20 text-blue-400'
                            }`}>
                              {isSparkContainer ? '星火' : '系统'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-primary font-mono text-xs block truncate" title={c.containerId || c.id}>
                              {(c.containerId || c.id).slice(0, 8)}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Server className="w-4 h-4 text-primary flex-shrink-0" />
                              <span className="text-on-surface text-sm truncate" title={c.serverName || getServerName(c.serverId)}>
                                {c.serverName || getServerName(c.serverId)}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-on-surface-variant text-sm block truncate" title={isSparkContainer ? (c.user?.displayName || c.user?.username) : c.name}>
                              {isSparkContainer ? (c.user?.displayName || c.user?.username) : (c.name || '-')}
                            </span>
                          </td>
                          <td className="p-3">
                            {isSparkContainer ? (
                              <span className="text-on-surface-variant text-sm block truncate" title={c.lab?.title}>
                                {c.lab?.title}
                              </span>
                            ) : (
                              <span className="text-on-surface-variant text-xs font-mono block truncate" title={c.image}>
                                {c.image || '-'}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs inline-block whitespace-nowrap ${
                              c.status === 'running' ? 'bg-status-success-bg text-status-success-text' : 
                              c.status === 'creating' ? 'bg-status-info-bg text-status-info-text' :
                              c.status === 'stopped' || c.status === 'exited' ? 'bg-status-neutral-bg text-status-neutral-text' :
                              'bg-surface-container text-on-surface-variant'
                            }`}>
                              {getStatusText(c.status)}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-on-surface-variant text-xs block">
                              {isSparkContainer ? formatTime(c.createdAt) : (c.created ? new Date(c.created).toLocaleString('zh-CN', { 
                                year: 'numeric',
                                month: '2-digit', 
                                day: '2-digit', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              }) : '-')}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              {operatingContainers.has(c.id) ? (
                                <div className="flex items-center gap-1 text-primary text-xs">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>处理中...</span>
                                </div>
                              ) : (
                                <>
                                  {c.status === 'running' ? (
                                    <>
                                      {((isSparkContainer && c.serverId && c.containerId) || !isSparkContainer) && (
                                        <>
                                          <button
                                            onClick={() => setTerminalContainer({
                                              serverId: c.serverId!,
                                              containerId: isSparkContainer ? c.containerId! : c.id,
                                              containerName: isSparkContainer ? (c.lab?.title || c.id.slice(0, 8)) : (c.name || c.id.slice(0, 8))
                                            })}
                                            className="text-blue-400 hover:text-blue-300 transition-colors text-xs whitespace-nowrap"
                                            title="打开终端"
                                          >
                                            终端
                                          </button>
                                          <span className="text-on-surface-variant/30">|</span>
                                        </>
                                      )}
                                      <button
                                        onClick={() => isSparkContainer ? handleLabContainerStop(c.id) : handleSystemContainerStop(c.serverId, c.id)}
                                        className="text-yellow-400 hover:text-yellow-300 transition-colors text-xs whitespace-nowrap"
                                        title="停止容器"
                                      >
                                        停止
                                      </button>
                                    </>
                                  ) : (c.status === 'stopped' || c.status === 'exited' || c.status === 'error') ? (
                                    <button
                                      onClick={() => isSparkContainer ? handleLabContainerStart(c.id) : handleSystemContainerStart(c.serverId, c.id)}
                                      className="text-green-400 hover:text-green-300 transition-colors text-xs whitespace-nowrap"
                                      title="启动容器"
                                    >
                                      启动
                                    </button>
                                  ) : null}
                                  {(c.status === 'stopped' || c.status === 'exited' || c.status === 'error' || c.status === 'running') && (
                                    <>
                                      <span className="text-on-surface-variant/30">|</span>
                                      <button
                                        onClick={() => isSparkContainer ? handleLabContainerRemove(c.id) : handleSystemContainerRemove(c.serverId, c.id)}
                                        className="text-red-400 hover:text-red-300 transition-colors text-xs whitespace-nowrap"
                                        title="删除容器"
                                      >
                                        删除
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片视图 */}
            <div className="lg:hidden space-y-4">
              {containers.length === 0 ? (
                <div className="app-card p-8 text-center text-on-surface-variant">
                  暂无容器
                </div>
              ) : (
                containers.map((c) => {
                  const isSparkContainer = !c.isDockerContainer;
                  return (
                    <div key={c.id} className="app-card p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              isSparkContainer ? 'bg-primary/20 text-primary' : 'bg-blue-400/20 text-blue-400'
                            }`}>
                              {isSparkContainer ? '星火' : '系统'}
                            </span>
                            <span className="text-primary font-mono text-xs">{(c.containerId || c.id).slice(0, 8)}</span>
                            <span className={`px-2 py-1 rounded text-xs ${
                              c.status === 'running' ? 'bg-status-success-bg text-status-success-text' : 
                              c.status === 'creating' ? 'bg-status-info-bg text-status-info-text' :
                              c.status === 'stopped' || c.status === 'exited' ? 'bg-status-neutral-bg text-status-neutral-text' :
                              'bg-surface-container text-on-surface-variant'
                            }`}>
                              {getStatusText(c.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-on-surface mb-1">
                            <Server className="w-4 h-4 text-primary" />
                            <span>{c.serverName || getServerName(c.serverId)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">{isSparkContainer ? '用户名称:' : '容器名称:'}</span>
                          <span className="text-on-surface">
                            {isSparkContainer ? (c.user?.displayName || c.user?.username) : (c.name || '-')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">{isSparkContainer ? '实验课程:' : '镜像:'}</span>
                          <span className="text-on-surface text-right">
                            {isSparkContainer ? c.lab?.title : <span className="text-xs font-mono">{c.image || '-'}</span>}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">创建时间:</span>
                          <span className="text-on-surface text-xs">
                            {isSparkContainer ? formatTime(c.createdAt) : (c.created ? new Date(c.created).toLocaleString('zh-CN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-')}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {operatingContainers.has(c.id) ? (
                          <div className="flex-1 py-2 bg-primary/10 text-primary rounded-lg flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">处理中...</span>
                          </div>
                        ) : (
                          <>
                            {c.status === 'running' ? (
                              <>
                                {((isSparkContainer && c.serverId && c.containerId) || !isSparkContainer) && (
                                  <button
                                    onClick={() => setTerminalContainer({
                                      serverId: c.serverId!,
                                      containerId: isSparkContainer ? c.containerId! : c.id,
                                      containerName: isSparkContainer ? (c.lab?.title || c.id.slice(0, 8)) : (c.name || c.id.slice(0, 8))
                                    })}
                                    className="flex-1 py-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors text-sm flex items-center justify-center gap-1"
                                  >
                                    <Terminal className="w-4 h-4" />
                                    终端
                                  </button>
                                )}
                                <button
                                  onClick={() => isSparkContainer ? handleLabContainerStop(c.id) : handleSystemContainerStop(c.serverId, c.id)}
                                  className="flex-1 py-2 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors text-sm"
                                >
                                  停止
                                </button>
                              </>
                            ) : (c.status === 'stopped' || c.status === 'exited' || c.status === 'error') ? (
                              <button
                                onClick={() => isSparkContainer ? handleLabContainerStart(c.id) : handleSystemContainerStart(c.serverId, c.id)}
                                className="flex-1 py-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors text-sm"
                              >
                                启动
                              </button>
                            ) : null}
                            {(c.status === 'stopped' || c.status === 'exited' || c.status === 'error' || c.status === 'running') && (
                              <button
                                onClick={() => isSparkContainer ? handleLabContainerRemove(c.id) : handleSystemContainerRemove(c.serverId, c.id)}
                                className="flex-1 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
                              >
                                删除
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 统计信息 */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">星火容器</p>
              <p className="text-2xl font-bold text-primary">{labContainers.length}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">系统容器</p>
              <p className="text-2xl font-bold text-blue-400">{systemContainers.length}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">运行中</p>
              <p className="text-2xl font-bold text-green-400">
                {containers.filter(c => c.status === 'running').length}
              </p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">容器镜像</p>
              <p className="text-2xl font-bold text-purple-400">{usedImages} / {totalImages}</p>
            </div>
          </div>
            </>
          )}
        </div>
      </main>

      {/* 终端弹窗 */}
      {terminalContainer && (
        <ContainerTerminal
          serverId={terminalContainer.serverId}
          containerId={terminalContainer.containerId}
          containerName={terminalContainer.containerName}
          onClose={() => setTerminalContainer(null)}
        />
      )}
    </div>
  );
}

