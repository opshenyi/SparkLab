'use client';

import { useState, useEffect } from 'react';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';
import { Plus, X, Server as ServerIcon, Activity, Cpu, HardDrive } from 'lucide-react';

interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  status: string;
  maxContainers: number;
  activeContainers: number;
  totalContainers?: number;
  cpuUsage: number;
  memoryUsage: number;
  cpuCores: number;
  cpuModel?: string;
  totalMemory: number;
  lastCheckAt: string;
  createdAt: string;
}

export default function ServersPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [servers, setServers] = useState<Server[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [deletingServer, setDeletingServer] = useState<string | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 2375,
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

  const isAdminOrAuthor =
    isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR');

  useEffect(() => {
    if (isAdminOrAuthor) {
      loadServers(true);
    }
  }, [isAuthenticated, user]);

  usePollWhileVisible(isAdminOrAuthor, () => void loadServers(false), 5000, true);

  const loadServers = async (showLoading = false) => {
    if (showLoading) {
      setDataLoading(true);
    }
    
    try {
      // 添加超时控制，10秒后放弃请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const { data } = await api.get('/servers', { signal: controller.signal });
      clearTimeout(timeoutId);
      setServers(data);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
        console.error('Request timeout - server may be slow or unreachable');
      } else {
        console.error('Failed to load servers:', error);
      }
    } finally {
      setDataLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingForm(true);
    try {
      if (editingServer) {
        // 编辑模式
        await api.put(`/servers/${editingServer.id}`, formData);
        setEditingServer(null);
        alert('服务器更新成功！');
      } else {
        // 新建模式
        await api.post('/servers', formData);
        alert('服务器添加成功！\n\n系统将在后台检测服务器状态。');
      }
      setShowAddModal(false);
      setFormData({
        name: '',
        host: '',
        port: 2375,
      });
      loadServers();
    } catch (error: any) {
      alert(`${editingServer ? '更新' : '添加'}服务器失败\n\n${error.response?.data?.message || '未知错误'}`);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      host: server.host,
      port: server.port,
    });
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingServer(null);
    setFormData({
      name: '',
      host: '',
      port: 2375,
    });
  };

  const handleTest = async (id: string) => {
    setTestingServer(id);
    try {
      await api.get(`/servers/${id}/containers`);
      // 成功提示
      const serverName = servers.find(s => s.id === id)?.name || '服务器';
      alert(`连接成功！\n\n${serverName} 可以正常访问 Docker API`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || '连接失败，请检查服务器地址和 Docker API 是否可访问';
      console.error('Connection test failed:', errorMsg);
      alert(`连接失败\n\n${errorMsg}`);
    } finally {
      setTestingServer(null);
    }
  };

  const handleDelete = async (id: string) => {
    const server = servers.find(s => s.id === id);
    if (!confirm(`确定要删除服务器 "${server?.name}" 吗？\n\n此操作不可恢复。`)) return;
    
    setDeletingServer(id);
    try {
      await api.delete(`/servers/${id}`);
      loadServers();
      alert('服务器删除成功');
    } catch (error: any) {
      alert(`删除失败\n\n${error.response?.data?.message || '未知错误'}`);
    } finally {
      setDeletingServer(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'offline': return 'text-gray-500';
      case 'error': return 'text-red-500';
      case 'maintenance': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return '在线';
      case 'offline': return '离线';
      case 'error': return '错误';
      case 'maintenance': return '维护中';
      default: return status;
    }
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
              服务器管理
            </h2>
            <p className="text-on-surface-variant text-lg">
              管理远程服务器，自动分配容器资源
            </p>
          </div>

          <div className="mb-6 flex justify-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              添加服务器
            </button>
          </div>

          {dataLoading ? (
            <div className="text-center py-12 text-on-surface-variant">加载中...</div>
          ) : (
            <div className="grid gap-6">
              {servers.map((server) => (
                <div key={server.id} className="app-card p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                        <ServerIcon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-page-title">{server.name}</h3>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${
                              server.status === 'online' ? 'bg-green-500' :
                              server.status === 'error' ? 'bg-red-500' :
                              server.status === 'maintenance' ? 'bg-yellow-500' :
                              'bg-gray-500'
                            }`} />
                            <span className={`text-xs ${getStatusColor(server.status)}`}>
                              {getStatusText(server.status)}
                            </span>
                          </div>
                        </div>
                        {server.host && (
                          <p className="text-xs text-on-surface-variant font-mono">{server.host}:{server.port}</p>
                        )}
                        {!server.host && (
                          <p className="text-xs text-red-400">未配置服务器地址</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTest(server.id)}
                        disabled={testingServer === server.id || deletingServer === server.id}
                        className="admin-control px-3 py-1.5 text-sm text-on-surface disabled:cursor-not-allowed disabled:opacity-45 flex items-center gap-2"
                      >
                        {testingServer === server.id ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            测试中...
                          </>
                        ) : (
                          '测试连接'
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(server)}
                        disabled={testingServer === server.id || deletingServer === server.id}
                        className="admin-control px-3 py-1.5 text-sm text-primary disabled:cursor-not-allowed disabled:opacity-45 flex items-center gap-2"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(server.id)}
                        disabled={testingServer === server.id || deletingServer === server.id}
                        className="px-3 py-1.5 text-sm bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {deletingServer === server.id ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            删除中...
                          </>
                        ) : (
                          '删除'
                        )}
                      </button>
                    </div>
                  </div>

                  {server.status === 'online' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-surface-container rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-primary" />
                          <p className="text-xs text-on-surface-variant">容器数</p>
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {server.activeContainers}/{server.totalContainers || server.maxContainers}
                        </p>
                      </div>
                      <div className="bg-surface-container rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu className="w-4 h-4 text-primary" />
                          <p className="text-xs text-on-surface-variant">CPU 使用率</p>
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {server.cpuUsage.toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-surface-container rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <HardDrive className="w-4 h-4 text-primary" />
                          <p className="text-xs text-on-surface-variant">内存使用率</p>
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {server.memoryUsage.toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-surface-container rounded-lg p-4 relative group">
                        <div className="flex items-center gap-2 mb-2">
                          <ServerIcon className="w-4 h-4 text-primary" />
                          <p className="text-xs text-on-surface-variant">负载</p>
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {((server.cpuUsage + server.memoryUsage) / 2).toFixed(1)}%
                        </p>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-container-highest rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          <p className="text-xs text-on-surface mb-1">
                            {server.cpuCores} 核 / {server.totalMemory}MB
                          </p>
                          {server.cpuModel && (
                            <p className="text-xs text-on-surface-variant">{server.cpuModel}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-surface-container rounded-lg p-4 text-center">
                      <p className="text-sm text-on-surface-variant mb-2">
                        {server.status === 'error' ? 'Docker 服务异常' : '未检测到 Docker'}
                      </p>
                      <p className="text-xs text-on-surface-variant/70">
                        请检查服务器连接和 Docker 配置
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {servers.length === 0 && (
                <div className="text-center py-12 app-card">
                  <ServerIcon className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
                  <p className="text-on-surface-variant">暂无服务器，点击上方按钮添加</p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="app-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-page-title">
                {editingServer ? '编辑服务器' : '添加服务器'}
              </h3>
              <button onClick={handleCloseModal} className="text-on-surface-variant hover:text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">服务器名称</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="104服务器"
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">服务器地址</label>
                <input
                  type="text"
                  required
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="192.168.1.100 或 其他内网地址"
                />
                <p className="text-xs text-on-surface-variant mt-2">
                  确保服务器的 Docker API 端口可访问，并且处于同一个内网
                </p>
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">Docker Sock 端口</label>
                <input
                  type="number"
                  required
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 2375 })}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="2375"
                />
                <p className="text-xs text-on-surface-variant mt-2">
                  默认端口: 2375 除非你改了否则保持默认
                </p>
              </div>

              <div className="bg-surface-container rounded-lg p-4">
                <p className="text-xs text-on-surface-variant">
                  <strong>配置提示：</strong> 
                  <br></br>
                  需要在远程服务器上启用 Docker Sock。
                  编辑 /etc/docker/daemon.json 添加：
                </p>
                <pre className="text-xs mt-2 text-primary font-mono">
{`{
  "hosts": ["tcp://0.0.0.0:2375", 
  "unix:///var/run/docker.sock"]
}`}
                </pre>
                <p className="text-xs text-on-surface-variant mt-2">
                  然后重启 Docker: <code className="text-primary">systemctl restart docker</code>
                </p>
           <p className="text-xs text-on-surface-variant mt-2">
                 注：需要服务器需要安装Docker，并且切换国内加速源 <code className="text-primary"><br></br>推荐：https://linuxmirrors.cn/</code>
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submittingForm}
                  className="flex-1 bg-surface-container text-on-surface-variant px-4 py-2 rounded-lg hover:bg-surface-bright transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submittingForm ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {editingServer ? '更新中...' : '添加中...'}
                    </>
                  ) : (
                    editingServer ? '更新' : '添加'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
}

