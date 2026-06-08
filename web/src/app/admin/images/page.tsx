'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import AdminSidebar from '@/components/AdminSidebar';
import { AdminNoServersPrompt } from '@/components/AdminNoServersPrompt';
import LoadingBar from '@/components/LoadingBar';
import AdminServerPickerButtons, { ADMIN_ALL_SERVERS } from '@/components/AdminServerPickerButtons';
import { Server, Image as ImageIcon, Download, Trash2, Plus, FileCode } from 'lucide-react';

interface ServerInfo {
  id: string;
  name: string;
  status: string;
}

interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: string;
  serverId?: string;
  serverName?: string;
}

export default function AdminImagesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [images, setImages] = useState<DockerImage[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>(ADMIN_ALL_SERVERS);
  const [lastAllModeCount, setLastAllModeCount] = useState(0);
  const [showPullModal, setShowPullModal] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [pullImageName, setPullImageName] = useState('');
  const [pullTag, setPullTag] = useState('latest');
  const [buildImageName, setBuildImageName] = useState('');
  const [buildTag, setBuildTag] = useState('latest');
  const [dockerfile, setDockerfile] = useState('FROM ubuntu:latest\nRUN apt-get update\nCMD ["/bin/bash"]');
  const [loading, setLoading] = useState(false);
  const [pullLogs, setPullLogs] = useState<string[]>([]);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [serversDataReady, setServersDataReady] = useState(false);
  const [registeredServerCount, setRegisteredServerCount] = useState(0);

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
      loadServers();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (selectedServer && (selectedServer !== ADMIN_ALL_SERVERS || servers.length > 0)) {
      void loadImages();
    }
  }, [selectedServer, servers.length]);

  const loadServers = async () => {
    try {
      const { data } = await api.get('/servers');
      const list = Array.isArray(data) ? data : [];
      setRegisteredServerCount(list.length);
      const onlineServers = list.filter((s: ServerInfo) => s.status === 'online');
      setServers(onlineServers);
      if (onlineServers.length > 0) {
        setSelectedServer((prev) => {
          if (prev === ADMIN_ALL_SERVERS) return ADMIN_ALL_SERVERS;
          if (prev && onlineServers.some((s) => s.id === prev)) return prev;
          return ADMIN_ALL_SERVERS;
        });
      } else {
        setSelectedServer('');
        setImages([]);
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setServersDataReady(true);
    }
  };

  const loadImages = async () => {
    if (!selectedServer) return;
    if (selectedServer === ADMIN_ALL_SERVERS && servers.length === 0) return;

    try {
      if (selectedServer === ADMIN_ALL_SERVERS) {
        const chunks = await Promise.all(
          servers.map(async (s) => {
            try {
              const { data } = await api.get(`/servers/${s.id}/images`);
              return (data.images || []).map((img: Record<string, unknown>) => ({
                ...img,
                serverId: s.id,
                serverName: s.name,
              })) as DockerImage[];
            } catch {
              return [] as DockerImage[];
            }
          })
        );
        const merged = chunks.flat();
        setImages(merged);
        setLastAllModeCount(merged.length);
        return;
      }

      const { data } = await api.get(`/servers/${selectedServer}/images`);
      const server = servers.find((s) => s.id === selectedServer);
      const formattedImages = (data.images || []).map((img: Record<string, unknown>) => ({
        ...img,
        serverId: selectedServer,
        serverName: server?.name,
      })) as DockerImage[];
      setImages(formattedImages);
    } catch (error) {
      console.error('Failed to load images:', error);
    }
  };

  const handlePullImage = async () => {
    if (!pullImageName || !selectedServer || selectedServer === ADMIN_ALL_SERVERS) return;
    
    setLoading(true);
    setPullLogs(['开始拉取镜像...']);
    try {
      const { data } = await api.post(`/servers/${selectedServer}/images/pull`, {
        imageName: pullImageName,
        tag: pullTag,
      });
      
      if (data.logs && data.logs.length > 0) {
        setPullLogs(data.logs);
      }
      
      setTimeout(() => {
        alert('镜像拉取成功！');
        setShowPullModal(false);
        setPullImageName('');
        setPullTag('latest');
        setPullLogs([]);
        loadImages();
      }, 1000);
    } catch (error: any) {
      setPullLogs(prev => [...prev, `错误: ${error.response?.data?.message || error.message}`]);
      setTimeout(() => {
        alert(`拉取镜像失败: ${error.response?.data?.message || error.message}`);
      }, 500);
    } finally {
      setLoading(false);
    }
  };

  const handleBuildImage = async () => {
    if (!buildImageName || !dockerfile || !selectedServer || selectedServer === ADMIN_ALL_SERVERS) return;
    
    setLoading(true);
    setBuildLogs(['开始构建镜像...']);
    try {
      const { data } = await api.post(`/servers/${selectedServer}/images/build`, {
        dockerfile,
        imageName: buildImageName,
        tag: buildTag,
      });
      
      if (data.logs && data.logs.length > 0) {
        setBuildLogs(data.logs);
      }
      
      setTimeout(() => {
        alert('镜像构建成功！');
        setShowBuildModal(false);
        setBuildImageName('');
        setBuildTag('latest');
        setBuildLogs([]);
        loadImages();
      }, 1000);
    } catch (error: any) {
      setBuildLogs(prev => [...prev, `错误: ${error.response?.data?.message || error.message}`]);
      setTimeout(() => {
        alert(`构建镜像失败: ${error.response?.data?.message || error.message}`);
      }, 500);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveImage = async (img: DockerImage) => {
    if (!confirm('确定要删除此镜像吗？')) return;
    const sid = img.serverId;
    if (!sid) return;
    try {
      await api.delete(`/servers/${sid}/images/${encodeURIComponent(img.id)}`);
      void loadImages();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      alert(`删除镜像失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
              镜像管理
            </h2>
            <p className="text-on-surface-variant text-lg">
              管理服务器上的 Docker 镜像和 Dockerfile
            </p>
          </div>

          {!serversDataReady ? (
            <div className="text-center py-16 text-on-surface-variant">加载中...</div>
          ) : registeredServerCount === 0 ? (
            <AdminNoServersPrompt context="镜像管理" />
          ) : servers.length === 0 ? (
            <AdminNoServersPrompt context="镜像管理" variant="no-online" />
          ) : (
            <>
          {/* 服务器切换与操作 */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <AdminServerPickerButtons
              servers={servers}
              value={selectedServer}
              onChange={setSelectedServer}
              showAllOption
              allLabel={`全部 (${selectedServer === ADMIN_ALL_SERVERS ? images.length : lastAllModeCount})`}
            />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowPullModal(true)}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg shadow-sm transition-all flex items-center gap-2 hover:opacity-95 disabled:bg-surface-lowest disabled:text-on-surface-variant disabled:opacity-100 disabled:shadow-none dark:disabled:bg-surface-container"
                disabled={!selectedServer || selectedServer === ADMIN_ALL_SERVERS}
              >
                <Download className="w-4 h-4" />
                拉取镜像
              </button>
              <button
                onClick={() => setShowBuildModal(true)}
                className="px-4 py-2 rounded-lg bg-sky-600 text-white shadow-sm transition-all flex items-center gap-2 hover:bg-sky-700 disabled:bg-surface-lowest disabled:text-on-surface-variant disabled:opacity-100 disabled:shadow-none dark:disabled:bg-surface-container"
                disabled={!selectedServer || selectedServer === ADMIN_ALL_SERVERS}
              >
                <FileCode className="w-4 h-4" />
                构建镜像
              </button>
            </div>
          </div>

          {/* 镜像列表 */}
          <div className="app-card overflow-hidden">
            <table className="w-full">
              <colgroup>
                <col style={{ width: '12%', minWidth: '100px' }} />
                {selectedServer === ADMIN_ALL_SERVERS && (
                  <col style={{ width: '12%', minWidth: '100px' }} />
                )}
                <col style={{ width: '30%', minWidth: '180px' }} />
                <col style={{ width: '14%', minWidth: '90px' }} />
                <col style={{ width: '18%', minWidth: '130px' }} />
                <col style={{ width: '14%', minWidth: '90px' }} />
              </colgroup>
              <thead className="bg-surface-container">
                <tr>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">镜像ID</th>
                  {selectedServer === ADMIN_ALL_SERVERS && (
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">服务器</th>
                  )}
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">标签</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">大小</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">创建时间</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">操作</th>
                </tr>
              </thead>
              <tbody>
                {images.length === 0 ? (
                  <tr>
                    <td colSpan={selectedServer === ADMIN_ALL_SERVERS ? 6 : 5} className="p-8 text-center text-on-surface-variant">
                      {selectedServer ? '暂无镜像' : '请选择服务器'}
                    </td>
                  </tr>
                ) : (
                  images.map((img) => (
                    <tr key={`${img.serverId ?? ''}-${img.id}`} className="hover:bg-surface-container transition-colors">
                      <td className="p-3">
                        <span className="text-primary font-mono text-xs block truncate" title={img.id}>
                          {img.id.replace('sha256:', '').slice(0, 12)}
                        </span>
                      </td>
                      {selectedServer === ADMIN_ALL_SERVERS && (
                        <td className="p-3">
                          <span className="text-on-surface-variant text-sm">{img.serverName ?? img.serverId ?? '-'}</span>
                        </td>
                      )}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {img.tags && img.tags.length > 0 ? (
                            img.tags.map((tag, idx) => (
                              <span key={idx} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-on-surface-variant text-xs">&lt;none&gt;</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-on-surface-variant text-sm">{formatSize(img.size)}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-on-surface-variant text-xs">
                          {new Date(img.created).toLocaleString('zh-CN', { 
                            month: '2-digit', 
                            day: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => void handleRemoveImage(img)}
                          className="text-red-400 hover:text-red-300 transition-colors text-sm flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 统计信息 */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">总镜像数</p>
              <p className="text-2xl font-bold text-page-title">{images.length}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">总大小</p>
              <p className="text-2xl font-bold text-blue-400">
                {formatSize(images.reduce((sum, img) => sum + img.size, 0))}
              </p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">在线服务器</p>
              <p className="text-2xl font-bold text-green-400">{servers.length}</p>
            </div>
          </div>
            </>
          )}
        </div>
      </main>

      {/* 拉取镜像模态框 */}
      {showPullModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-page-title mb-4">拉取镜像</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">镜像名称</label>
                <input
                  type="text"
                  value={pullImageName}
                  onChange={(e) => setPullImageName(e.target.value)}
                  placeholder="例如: nginx, ubuntu, mysql"
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">标签</label>
                <input
                  type="text"
                  value={pullTag}
                  onChange={(e) => setPullTag(e.target.value)}
                  placeholder="latest"
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                  disabled={loading}
                />
              </div>
              
              {/* 日志显示区域 */}
              {pullLogs.length > 0 && (
                <div>
                  <label className="block text-sm text-on-surface-variant mb-2">拉取日志</label>
                  <div className="bg-surface-container rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-xs">
                    {pullLogs.map((log, idx) => (
                      <div key={idx} className="text-green-400 mb-1">
                        {log}
                      </div>
                    ))}
                    {loading && (
                      <div className="text-blue-400 animate-pulse">
                        拉取中...
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handlePullImage}
                  disabled={loading || !pullImageName}
                  className="flex-1 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {loading ? '拉取中...' : '拉取'}
                </button>
                <button
                  onClick={() => {
                    setShowPullModal(false);
                    setPullLogs([]);
                  }}
                  disabled={loading}
                  className="flex-1 py-2 bg-surface-container text-on-surface rounded-lg hover:bg-surface-bright transition-all disabled:opacity-50"
                >
                  {loading ? '拉取中请稍候' : '取消'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 构建镜像模态框 */}
      {showBuildModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-page-title mb-4">构建镜像</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">镜像名称</label>
                <input
                  type="text"
                  value={buildImageName}
                  onChange={(e) => setBuildImageName(e.target.value)}
                  placeholder="例如: myapp"
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">标签</label>
                <input
                  type="text"
                  value={buildTag}
                  onChange={(e) => setBuildTag(e.target.value)}
                  placeholder="latest"
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">Dockerfile</label>
                <textarea
                  value={dockerfile}
                  onChange={(e) => setDockerfile(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary font-mono text-sm"
                  disabled={loading}
                />
              </div>
              
              {/* 日志显示区域 */}
              {buildLogs.length > 0 && (
                <div>
                  <label className="block text-sm text-on-surface-variant mb-2">构建日志</label>
                  <div className="bg-surface-container rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-xs">
                    {buildLogs.map((log, idx) => (
                      <div key={idx} className="text-green-400 mb-1">
                        {log}
                      </div>
                    ))}
                    {loading && (
                      <div className="text-blue-400 animate-pulse">
                        构建中...
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleBuildImage}
                  disabled={loading || !buildImageName || !dockerfile}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
                >
                  {loading ? '构建中...' : '构建'}
                </button>
                <button
                  onClick={() => {
                    setShowBuildModal(false);
                    setBuildLogs([]);
                  }}
                  disabled={loading}
                  className="flex-1 py-2 bg-surface-container text-on-surface rounded-lg hover:bg-surface-bright transition-all disabled:opacity-50"
                >
                  {loading ? '构建中请稍候' : '取消'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

