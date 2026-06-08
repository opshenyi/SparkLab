'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import AdminSidebar from '@/components/AdminSidebar';
import { AdminNoServersPrompt } from '@/components/AdminNoServersPrompt';
import LoadingBar from '@/components/LoadingBar';
import AdminServerPickerButtons, { ADMIN_ALL_SERVERS } from '@/components/AdminServerPickerButtons';
import { volumeAPI } from '@/lib/api';
import api from '@/lib/api';

interface Volume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  CreatedAt: string;
  Labels: Record<string, string> | null;
  Options: Record<string, string> | null;
  Scope: string;
  UsageData?: {
    Size: number;
    RefCount: number;
  };
  serverId?: string;
  serverName?: string;
}

interface Server {
  id: string;
  name: string;
  status: string;
}

export default function VolumesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>(ADMIN_ALL_SERVERS);
  const [lastAllModeCount, setLastAllModeCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [serversLoading, setServersLoading] = useState(true);
  const [registeredServerCount, setRegisteredServerCount] = useState(0);
  const [error, setError] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<Volume | null>(null);
  const [newVolume, setNewVolume] = useState({
    name: '',
    driver: 'local',
    labels: {} as Record<string, string>,
    options: {} as Record<string, string>,
  });

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
      fetchServers();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (selectedServer && (selectedServer !== ADMIN_ALL_SERVERS || servers.length > 0)) {
      void fetchVolumes();
    }
  }, [selectedServer, servers.length]);

  const fetchServers = async () => {
    setServersLoading(true);
    setError('');
    try {
      const response = await api.get('/servers');
      const list = Array.isArray(response.data) ? response.data : [];
      setRegisteredServerCount(list.length);
      const onlineServers = list.filter((s: Server) => s.status === 'online');
      setServers(onlineServers);
      if (onlineServers.length > 0) {
        setSelectedServer((prev) => {
          if (prev === ADMIN_ALL_SERVERS) return ADMIN_ALL_SERVERS;
          if (prev && onlineServers.some((s) => s.id === prev)) return prev;
          return ADMIN_ALL_SERVERS;
        });
      } else {
        setSelectedServer('');
        setVolumes([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch servers:', error);
      setError('获取服务器列表失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setServersLoading(false);
    }
  };

  const fetchVolumes = async () => {
    if (!selectedServer) return;
    if (selectedServer === ADMIN_ALL_SERVERS && servers.length === 0) return;

    setLoading(true);
    setError('');
    try {
      if (selectedServer === ADMIN_ALL_SERVERS) {
        const chunks = await Promise.all(
          servers.map(async (s) => {
            try {
              const response = await volumeAPI.getAll(s.id);
              const volumeList = response.data.Volumes || response.data.volumes || [];
              return (volumeList as Volume[]).map((v) => ({
                ...v,
                serverId: s.id,
                serverName: s.name,
              }));
            } catch {
              return [] as Volume[];
            }
          })
        );
        const merged = chunks.flat();
        setVolumes(merged);
        setLastAllModeCount(merged.length);
        return;
      }

      const response = await volumeAPI.getAll(selectedServer);
      const volumeList = response.data.Volumes || response.data.volumes || [];
      const srv = servers.find((s) => s.id === selectedServer);
      setVolumes(
        (volumeList as Volume[]).map((v) => ({
          ...v,
          serverId: selectedServer,
          serverName: srv?.name,
        }))
      );
    } catch (error: any) {
      console.error('Failed to fetch volumes:', error);
      setError('获取存储卷列表失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVolume = async () => {
    if (!newVolume.name.trim()) {
      alert('请输入存储卷名称');
      return;
    }
    if (!selectedServer || selectedServer === ADMIN_ALL_SERVERS) {
      alert('请先选择一台服务器');
      return;
    }

    try {
      await volumeAPI.create({
        serverId: selectedServer,
        name: newVolume.name,
        driver: newVolume.driver,
        labels: Object.keys(newVolume.labels).length > 0 ? newVolume.labels : undefined,
        options: Object.keys(newVolume.options).length > 0 ? newVolume.options : undefined,
      });
      
      setShowCreateModal(false);
      setNewVolume({ name: '', driver: 'local', labels: {}, options: {} });
      void fetchVolumes();
    } catch (error: any) {
      alert(`创建失败: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleRemoveVolume = async (vol: Volume, force: boolean = false) => {
    const sid = vol.serverId ?? selectedServer;
    if (!sid || sid === ADMIN_ALL_SERVERS) return;
    const name = vol.Name;
    if (!confirm(`确定要删除存储卷 "${name}" 吗？${force ? '（强制删除）' : ''}`)) {
      return;
    }

    try {
      await volumeAPI.remove(name, sid, force);
      void fetchVolumes();
    } catch (error: any) {
      if (!force && error.response?.status === 500) {
        if (confirm('存储卷正在使用中，是否强制删除？')) {
          void handleRemoveVolume(vol, true);
        }
      } else {
        alert(`删除失败: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  const handleViewDetail = async (volume: Volume) => {
    const sid = volume.serverId ?? selectedServer;
    if (!sid || sid === ADMIN_ALL_SERVERS) {
      alert('无法在「全部」视图下查看详情，请先选择服务器');
      return;
    }
    try {
      const response = await volumeAPI.getOne(volume.Name, sid);
      setSelectedVolume({
        ...response.data,
        serverId: sid,
        serverName: volume.serverName ?? servers.find((s) => s.id === sid)?.name,
      });
      setShowDetailModal(true);
    } catch (error: any) {
      alert(`获取详情失败: ${error.response?.data?.error || error.message}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
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
          <div className="mb-8">
            <h2 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-2">
              存储卷管理
            </h2>
            <p className="text-on-surface-variant text-lg">
              管理 Docker 存储卷
            </p>
          </div>

          {serversLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-on-surface-variant">加载服务器列表...</p>
            </div>
          ) : registeredServerCount === 0 ? (
            <AdminNoServersPrompt context="存储卷管理" />
          ) : servers.length === 0 ? (
            <AdminNoServersPrompt context="存储卷管理" variant="no-online" />
          ) : (
            <>
          {/* 错误提示 */}
          {error && (
            <div className="bg-error/10 rounded-xl p-4 mb-6">
              <p className="text-error">{error}</p>
            </div>
          )}

          {/* 服务器切换与操作栏 */}
          <div className="mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <AdminServerPickerButtons
                  servers={servers}
                  value={selectedServer}
                  onChange={setSelectedServer}
                  showAllOption
                  allLabel={`全部 (${selectedServer === ADMIN_ALL_SERVERS ? volumes.length : lastAllModeCount})`}
                />
                <button
                  type="button"
                  onClick={() => void fetchVolumes()}
                  disabled={loading || !selectedServer}
                  className="admin-control px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {loading ? '刷新中...' : '刷新'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                disabled={!selectedServer || selectedServer === ADMIN_ALL_SERVERS}
                className="rounded-lg bg-primary px-6 py-2 text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                创建存储卷
              </button>
            </div>
          </div>

          {/* 存储卷列表 */}
          {!selectedServer ? (
            <div className="app-card p-12 text-center">
              <p className="text-on-surface-variant text-lg">暂无在线服务器</p>
              <p className="text-sm text-on-surface-variant/70 mt-2">请检查节点连接状态后再试</p>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-on-surface-variant">加载存储卷列表...</p>
            </div>
          ) : volumes.length === 0 ? (
            <div className="app-card p-12 text-center">
              <p className="text-on-surface-variant text-lg">暂无存储卷</p>
              <p className="text-sm text-on-surface-variant/70 mt-2">
                点击"创建存储卷"按钮开始创建
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-on-surface-variant">
                  共 {volumes.length} 个存储卷
                </p>
              </div>
              
              {volumes.map((volume) => (
                <div
                  key={`${volume.serverId ?? selectedServer}-${volume.Name}`}
                  className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <h3 className="text-xl font-bold text-page-title">{volume.Name}</h3>
                        {selectedServer === ADMIN_ALL_SERVERS && (
                          <span className="px-3 py-1 bg-surface-container text-on-surface-variant text-xs rounded-full">
                            {volume.serverName ?? volume.serverId}
                          </span>
                        )}
                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                          {volume.Driver}
                        </span>
                        {volume.Scope !== 'local' && (
                          <span className="px-3 py-1 bg-surface-container text-xs rounded-full">
                            {volume.Scope}
                          </span>
                        )}
                        {volume.UsageData && volume.UsageData.RefCount > 0 && (
                          <span className="px-3 py-1 bg-success/10 text-success text-xs rounded-full font-medium">
                            使用中 ({volume.UsageData.RefCount})
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                        <div>
                          <span className="text-on-surface-variant">挂载点:</span>
                          <p className="text-on-surface font-mono text-xs mt-1 break-all bg-surface-container px-2 py-1 rounded">
                            {volume.Mountpoint}
                          </p>
                        </div>
                        <div>
                          <span className="text-on-surface-variant">创建时间:</span>
                          <p className="text-on-surface mt-1">{formatDate(volume.CreatedAt)}</p>
                        </div>
                        {volume.UsageData && (
                          <>
                            <div>
                              <span className="text-on-surface-variant">大小:</span>
                              <p className="text-on-surface mt-1 font-medium">{formatBytes(volume.UsageData.Size)}</p>
                            </div>
                            <div>
                              <span className="text-on-surface-variant">引用计数:</span>
                              <p className="text-on-surface mt-1">{volume.UsageData.RefCount} 个容器</p>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {volume.Labels && Object.keys(volume.Labels).length > 0 && (
                        <div className="mt-3 pt-3">
                          <span className="text-on-surface-variant text-xs">标签:</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {Object.entries(volume.Labels).map(([key, value]) => (
                              <span key={key} className="px-2 py-1 bg-surface-container text-xs rounded">
                                {key}: {value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <button
                        type="button"
                        onClick={() => void handleViewDetail(volume)}
                        className="px-4 py-2 bg-surface-container hover:bg-surface-container-high rounded-lg transition-colors text-sm"
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveVolume(volume)}
                        className="px-4 py-2 bg-error/10 text-error hover:bg-error/20 rounded-lg transition-colors text-sm"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </main>

      {/* 创建存储卷模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-page-title text-2xl font-bold mb-6">创建存储卷</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  名称 <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={newVolume.name}
                  onChange={(e) => setNewVolume({ ...newVolume, name: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-container rounded-lg border border-outline focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="my-volume"
                />
                <p className="text-xs text-on-surface-variant mt-1">
                  只能包含字母、数字、下划线、点和连字符
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">驱动</label>
                <input
                  type="text"
                  value="local"
                  disabled
                  className="w-full px-4 py-2 bg-surface-container rounded-lg border border-outline text-on-surface-variant cursor-not-allowed"
                />
                <p className="text-xs text-on-surface-variant mt-1">
                  数据存储在 Docker 主机的本地文件系统
                </p>
              </div>

              <div className="bg-surface-container p-4 rounded-lg">
                <p className="text-sm text-on-surface-variant">
                  提示：创建后可以在容器配置中使用此存储卷来持久化数据
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewVolume({ name: '', driver: 'local', labels: {}, options: {} });
                }}
                className="px-6 py-2 bg-surface-container hover:bg-surface-container-high rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateVolume}
                disabled={!newVolume.name.trim()}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情模态框 */}
      {showDetailModal && selectedVolume && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-page-title text-2xl font-bold">存储卷详情</h3>
              <div className="flex gap-2">
                {selectedVolume.UsageData && selectedVolume.UsageData.RefCount > 0 ? (
                  <span className="px-3 py-1 bg-success/10 text-success text-sm rounded-full">
                    使用中
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-surface-container text-sm rounded-full">
                    未使用
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="bg-surface-container p-4 rounded-lg">
                <h4 className="text-page-title text-sm font-medium mb-3">基本信息</h4>
                <div className="grid grid-cols-2 gap-4">
                  {(selectedVolume.serverName || selectedVolume.serverId) && (
                    <div className="col-span-2">
                      <label className="block text-xs text-on-surface-variant mb-1">服务器</label>
                      <p className="text-on-surface font-medium">
                        {selectedVolume.serverName || selectedVolume.serverId}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">名称</label>
                    <p className="text-on-surface font-medium">{selectedVolume.Name}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">驱动</label>
                    <p className="text-on-surface">{selectedVolume.Driver}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">作用域</label>
                    <p className="text-on-surface">{selectedVolume.Scope}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">创建时间</label>
                    <p className="text-on-surface">{formatDate(selectedVolume.CreatedAt)}</p>
                  </div>
                </div>
              </div>

              {/* 使用情况 */}
              {selectedVolume.UsageData && (
                <div className="bg-surface-container p-4 rounded-lg">
                  <h4 className="text-page-title text-sm font-medium mb-3">使用情况</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">存储大小</label>
                      <p className="text-on-surface font-medium text-lg">
                        {formatBytes(selectedVolume.UsageData.Size)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">引用计数</label>
                      <p className="text-on-surface font-medium text-lg">
                        {selectedVolume.UsageData.RefCount} 个容器
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 挂载点 */}
              <div className="bg-surface-container p-4 rounded-lg">
                <h4 className="text-page-title text-sm font-medium mb-3">挂载点</h4>
                <div className="bg-background p-3 rounded font-mono text-sm break-all">
                  {selectedVolume.Mountpoint}
                </div>
                <p className="text-xs text-on-surface-variant mt-2">
                  这是存储卷在 Docker 主机上的实际存储位置
                </p>
              </div>
              
              {/* 标签 */}
              {selectedVolume.Labels && Object.keys(selectedVolume.Labels).length > 0 && (
                <div className="bg-surface-container p-4 rounded-lg">
                  <h4 className="text-page-title text-sm font-medium mb-3">标签</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedVolume.Labels).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3 text-sm">
                        <span className="text-primary font-medium min-w-[120px]">{key}</span>
                        <span className="text-on-surface-variant">:</span>
                        <span className="text-on-surface flex-1">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 驱动选项 */}
              {selectedVolume.Options && Object.keys(selectedVolume.Options).length > 0 && (
                <div className="bg-surface-container p-4 rounded-lg">
                  <h4 className="text-page-title text-sm font-medium mb-3">驱动选项</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedVolume.Options).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3 text-sm">
                        <span className="text-primary font-medium min-w-[120px]">{key}</span>
                        <span className="text-on-surface-variant">:</span>
                        <span className="text-on-surface flex-1 font-mono text-xs">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => void handleRemoveVolume(selectedVolume)}
                className="px-6 py-2 bg-error/10 text-error hover:bg-error/20 rounded-lg transition-colors"
              >
                删除存储卷
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedVolume(null);
                }}
                className="px-6 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

