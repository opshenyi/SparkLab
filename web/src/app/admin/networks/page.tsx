'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import AdminSidebar from '@/components/AdminSidebar';
import { AdminNoServersPrompt } from '@/components/AdminNoServersPrompt';
import LoadingBar from '@/components/LoadingBar';
import AdminServerPickerButtons, { ADMIN_ALL_SERVERS } from '@/components/AdminServerPickerButtons';

interface ServerInfo {
  id: string;
  name: string;
  status: string;
}

interface DockerNetwork {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
  Created: string;
  IPAM?: {
    Driver?: string;
    Config?: Array<{
      Subnet?: string;
      Gateway?: string;
      IPRange?: string;
      AuxiliaryAddresses?: Record<string, string>;
    }>;
    Options?: Record<string, string>;
  };
  EnableIPv6?: boolean;
  Options?: Record<string, string>;
  Labels?: Record<string, string>;
  Internal?: boolean;
  Attachable?: boolean;
  Ingress?: boolean;
  ConfigFrom?: {
    Network?: string;
  };
  ConfigOnly?: boolean;
  Containers?: Record<string, any>;
  containers?: number;
  serverId?: string;
  serverName?: string;
}

export default function NetworksPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [lastAllModeCount, setLastAllModeCount] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<DockerNetwork | null>(null);
  const [loading, setLoading] = useState(false);
  const [serversDataReady, setServersDataReady] = useState(false);
  const [registeredServerCount, setRegisteredServerCount] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    driver: 'bridge',
    subnet: '',
    gateway: '',
    ipRange: '',
    excludeIps: '',
    enableIPv6: false,
    ipv6Subnet: '',
    ipv6Gateway: '',
    options: '',
    labels: '',
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
      loadServers();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (selectedServer && (selectedServer !== ADMIN_ALL_SERVERS || servers.length > 0)) {
      void loadNetworks();
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
          if (prev && onlineServers.some((s) => s.id === prev)) return prev;
          return onlineServers[0].id;
        });
      } else {
        setSelectedServer('');
        setNetworks([]);
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setServersDataReady(true);
    }
  };

  const loadNetworks = async () => {
    if (!selectedServer) return;
    if (selectedServer === ADMIN_ALL_SERVERS && servers.length === 0) return;

    try {
      if (selectedServer === ADMIN_ALL_SERVERS) {
        const chunks = await Promise.all(
          servers.map(async (s) => {
            try {
              const { data } = await api.get(`/servers/${s.id}/networks`);
              return (data.networks || []).map((net: Record<string, unknown>) => ({
                ...net,
                serverId: s.id,
                serverName: s.name,
              })) as DockerNetwork[];
            } catch {
              return [] as DockerNetwork[];
            }
          })
        );
        const merged = chunks.flat();
        setNetworks(merged);
        setLastAllModeCount(merged.length);
        return;
      }

      const { data } = await api.get(`/servers/${selectedServer}/networks`);
      const server = servers.find((s) => s.id === selectedServer);
      const formattedNetworks = (data.networks || []).map((net: Record<string, unknown>) => ({
        ...net,
        serverId: selectedServer,
        serverName: server?.name,
      })) as DockerNetwork[];
      setNetworks(formattedNetworks);
    } catch (error) {
      console.error('Failed to load networks:', error);
    }
  };

  const handleCreateNetwork = async () => {
    if (!formData.name || !selectedServer || selectedServer === ADMIN_ALL_SERVERS) return;
    
    setLoading(true);
    try {
      await api.post(`/servers/${selectedServer}/networks`, formData);
      alert('网络创建成功！');
      setShowCreateModal(false);
      setShowAdvanced(false);
      setFormData({
        name: '',
        driver: 'bridge',
        subnet: '',
        gateway: '',
        ipRange: '',
        excludeIps: '',
        enableIPv6: false,
        ipv6Subnet: '',
        ipv6Gateway: '',
        options: '',
        labels: '',
      });
      void loadNetworks();
    } catch (error: any) {
      alert(`创建网络失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveNetwork = async (net: DockerNetwork) => {
    const networkName = net.Name;
    const networkId = net.Id;
    const sid = net.serverId;
    if (!networkName || !networkId || !sid) return;
    if (!confirm(`确定要删除网络 "${networkName}" 吗？`)) return;

    try {
      await api.delete(`/servers/${sid}/networks/${networkId}`);
      void loadNetworks();
    } catch (error: any) {
      alert(`删除网络失败: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleShowDetails = (network: DockerNetwork) => {
    setSelectedNetwork(network);
    setShowDetailsModal(true);
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
              网络管理
            </h2>
            <p className="text-on-surface-variant text-lg">
              管理 Docker 网络配置
            </p>
          </div>

          {!serversDataReady ? (
            <div className="text-center py-16 text-on-surface-variant">加载中...</div>
          ) : registeredServerCount === 0 ? (
            <AdminNoServersPrompt context="网络管理" />
          ) : servers.length === 0 ? (
            <AdminNoServersPrompt context="网络管理" variant="no-online" />
          ) : (
            <>
          {/* 服务器切换与操作 */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <AdminServerPickerButtons
              servers={servers}
              value={selectedServer}
              onChange={setSelectedServer}
            />

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="text-button text-button-primary disabled:bg-surface-lowest disabled:text-on-surface-variant disabled:opacity-100 dark:disabled:bg-surface-container"
              disabled={!selectedServer}
            >
              创建网络
            </button>
          </div>

          {/* 网络列表 */}
          <div className="app-card overflow-hidden">
            <table className="w-full">
              <colgroup>
                <col style={{ width: '12%', minWidth: '100px' }} />
                {selectedServer === ADMIN_ALL_SERVERS && (
                  <col style={{ width: '12%', minWidth: '100px' }} />
                )}
                <col style={{ width: '22%', minWidth: '130px' }} />
                <col style={{ width: '13%', minWidth: '90px' }} />
                <col style={{ width: '13%', minWidth: '90px' }} />
                <col style={{ width: '13%', minWidth: '100px' }} />
                <col style={{ width: '15%', minWidth: '90px' }} />
              </colgroup>
              <thead className="bg-surface-container">
                <tr>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">网络ID</th>
                  {selectedServer === ADMIN_ALL_SERVERS && (
                    <th className="text-left p-3 text-sm font-medium text-on-surface-variant">服务器</th>
                  )}
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">名称</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">驱动</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">作用域</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">子网</th>
                  <th className="text-left p-3 text-sm font-medium text-on-surface-variant">操作</th>
                </tr>
              </thead>
              <tbody>
                {networks.length === 0 ? (
                  <tr>
                    <td colSpan={selectedServer === ADMIN_ALL_SERVERS ? 7 : 6} className="p-8 text-center text-on-surface-variant">
                      {selectedServer ? '暂无网络' : '本机 Docker 暂不可用'}
                    </td>
                  </tr>
                ) : (
                  networks.map((net) => (
                    <tr key={`${net.serverId ?? ''}-${net.Id}`} className="hover:bg-surface-container transition-colors">
                      <td className="p-3">
                        <span className="text-primary font-mono text-xs block truncate" title={net.Id || ''}>
                          {net.Id ? net.Id.slice(0, 12) : '-'}
                        </span>
                      </td>
                      {selectedServer === ADMIN_ALL_SERVERS && (
                        <td className="p-3">
                          <span className="text-on-surface-variant text-sm">{net.serverName ?? net.serverId ?? '-'}</span>
                        </td>
                      )}
                      <td className="p-3">
                        <span className="text-on-surface text-sm font-medium">{net.Name || '-'}</span>
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                          {net.Driver || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-on-surface-variant text-sm">{net.Scope || '-'}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-on-surface-variant text-xs font-mono">
                          {net.IPAM?.Config?.[0]?.Subnet || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleShowDetails(net)}
                            className="text-sm font-medium text-primary transition-colors hover:opacity-80"
                            title="查看详情"
                          >
                            详情
                          </button>
                          {net.Name && !['bridge', 'host', 'none'].includes(net.Name) && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveNetwork(net)}
                              className="text-sm font-medium text-status-error-text transition-colors hover:text-status-error"
                              title="删除网络"
                            >
                              删除
                            </button>
                          )}
                        </div>
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
              <p className="text-xs text-on-surface-variant mb-1">总网络数</p>
              <p className="text-2xl font-bold text-page-title">{networks.length}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">自定义网络</p>
              <p className="text-2xl font-bold text-primary">
                {networks.filter(n => n.Name && !['bridge', 'host', 'none'].includes(n.Name)).length}
              </p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-on-surface-variant mb-1">本机 Docker</p>
              <p className="text-2xl font-bold text-status-success-text">{servers.length}</p>
            </div>
          </div>
            </>
          )}
        </div>
      </main>

      {/* 创建网络模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* 固定标题 */}
            <div className="p-6 pb-4">
              <h3 className="text-2xl font-bold text-page-title">创建网络</h3>
            </div>

            {/* 可滚动内容区域 */}
            <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-thin">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-on-surface-variant mb-2">网络名称 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如: my-network"
                    className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                    disabled={loading}
                  />
                </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">模式 *</label>
                <select
                  value={formData.driver}
                  onChange={(e) => setFormData({ ...formData, driver: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                  disabled={loading}
                >
                  <option value="bridge">bridge - 桥接网络（默认）</option>
                  <option value="overlay">overlay - 跨主机网络（需要 Swarm 模式）</option>
                  <option value="ipvlan">ipvlan - IP VLAN 网络（需要内核 4.2+）</option>
                  <option value="macvlan">macvlan - MAC VLAN 网络</option>
                </select>
                {formData.driver === 'overlay' && (
                  <p className="mt-1 text-xs text-status-warning-text">
                    Overlay 网络需要 Docker Swarm 模式。如果未初始化 Swarm，请先运行: docker swarm init
                  </p>
                )}
                {formData.driver === 'ipvlan' && (
                  <p className="mt-1 text-xs text-status-warning-text">
                    IPvlan 需要 Linux 内核版本 4.2 或更高
                  </p>
                )}
                {formData.driver === 'macvlan' && (
                  <p className="mt-1 text-xs text-primary">
                    Macvlan 需要在高级选项中指定 parent 参数，例如: parent=eth0
                  </p>
                )}
              </div>

              {/* IPv4 配置 */}
              <div className="border-t border-outline-variant/20 pt-4">
                <h4 className="text-sm font-bold text-page-title mb-3">IPv4 配置</h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">子网</label>
                    <input
                      type="text"
                      value={formData.subnet}
                      onChange={(e) => setFormData({ ...formData, subnet: e.target.value })}
                      placeholder="例如: 172.16.10.0/24"
                      className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">网关</label>
                    <input
                      type="text"
                      value={formData.gateway}
                      onChange={(e) => setFormData({ ...formData, gateway: e.target.value })}
                      placeholder="例如: 172.16.10.1"
                      className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">IP 范围</label>
                    <input
                      type="text"
                      value={formData.ipRange}
                      onChange={(e) => setFormData({ ...formData, ipRange: e.target.value })}
                      placeholder="例如: 172.16.10.0/16"
                      className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                      disabled={loading}
                    />
                    <p className="text-xs text-on-surface-variant mt-1">
                      限制容器可以使用的 IP 地址范围
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">排除 IP</label>
                    <input
                      type="text"
                      value={formData.excludeIps}
                      onChange={(e) => setFormData({ ...formData, excludeIps: e.target.value })}
                      placeholder="例如: 172.16.10.1,172.16.10.2-172.16.10.10"
                      className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                      disabled={loading}
                    />
                    <p className="text-xs text-on-surface-variant mt-1">
                      排除不分配给容器的 IP 地址，多个用逗号分隔
                    </p>
                  </div>
                </div>
              </div>

              {/* IPv6 配置 */}
              <div className="border-t border-outline-variant/20 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="enableIPv6"
                    checked={formData.enableIPv6}
                    onChange={(e) => setFormData({ ...formData, enableIPv6: e.target.checked })}
                    className="w-4 h-4"
                    disabled={loading}
                  />
                  <label htmlFor="enableIPv6" className="text-sm font-bold text-primary cursor-pointer">
                    启用 IPv6
                  </label>
                </div>

                {formData.enableIPv6 && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">IPv6 子网</label>
                      <input
                        type="text"
                        value={formData.ipv6Subnet}
                        onChange={(e) => setFormData({ ...formData, ipv6Subnet: e.target.value })}
                        placeholder="例如: 2001:db8::/64"
                        className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">IPv6 网关</label>
                      <input
                        type="text"
                        value={formData.ipv6Gateway}
                        onChange={(e) => setFormData({ ...formData, ipv6Gateway: e.target.value })}
                        placeholder="例如: 2001:db8::1"
                        className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary"
                        disabled={loading}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 高级选项 */}
              <div className="border-t border-outline-variant/20 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between text-sm font-bold text-primary hover:text-primary/80 transition-colors"
                  disabled={loading}
                >
                  <span>高级选项</span>
                  <span>{showAdvanced ? '收起' : '展开'}</span>
                </button>
                
                {showAdvanced && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">参数</label>
                      <textarea
                        value={formData.options}
                        onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                        placeholder="一行一个，例如:&#10;com.docker.network.bridge.name=docker1&#10;com.docker.network.bridge.enable_icc=true"
                        rows={3}
                        className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary font-mono text-sm"
                        disabled={loading}
                      />
                      <p className="text-xs text-on-surface-variant mt-1">
                        网络驱动特定的选项，一行一个，格式: key=value
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">标签</label>
                      <textarea
                        value={formData.labels}
                        onChange={(e) => setFormData({ ...formData, labels: e.target.value })}
                        placeholder="一行一个，例如:&#10;environment=production&#10;team=backend"
                        rows={3}
                        className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-lg border border-outline-variant focus:outline-none focus:border-primary font-mono text-sm"
                        disabled={loading}
                      />
                      <p className="text-xs text-on-surface-variant mt-1">
                        网络元数据标签，一行一个，格式: key=value
                      </p>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
            
            {/* 固定底部按钮 */}
            <div className="p-6 pt-4">
              <div className="flex gap-2">
                <button
                  onClick={handleCreateNetwork}
                  disabled={loading || !formData.name}
                  className="text-button text-button-primary flex-1 disabled:opacity-50"
                >
                  {loading ? '创建中...' : '创建'}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={loading}
                  className="text-button text-button-secondary flex-1 disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 网络详情模态框 */}
      {showDetailsModal && selectedNetwork && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* 固定标题 */}
            <div className="p-6 pb-4">
              <h3 className="text-2xl font-bold text-page-title">网络详情</h3>
            </div>

            {/* 可滚动内容 */}
            <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-thin">
              <div className="space-y-4">
                {/* 基本信息 */}
                <div className="border-b border-outline-variant/20 pb-4">
                  <h4 className="text-sm font-bold text-page-title mb-3">基本信息</h4>
                  <div className="space-y-3">
                    {(selectedNetwork.serverName || selectedNetwork.serverId) && (
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-1">服务器</label>
                        <p className="text-sm text-on-surface">
                          {selectedNetwork.serverName || selectedNetwork.serverId}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-1">网络ID</label>
                      <p className="text-sm text-on-surface font-mono break-all">{selectedNetwork.Id || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-1">名称</label>
                      <p className="text-sm text-on-surface">{selectedNetwork.Name || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-1">驱动</label>
                      <p className="text-sm text-on-surface">{selectedNetwork.Driver || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-1">作用域</label>
                      <p className="text-sm text-on-surface">{selectedNetwork.Scope || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-1">创建时间</label>
                      <p className="text-sm text-on-surface">
                        {selectedNetwork.Created ? new Date(selectedNetwork.Created).toLocaleString('zh-CN') : '-'}
                      </p>
                    </div>
                    {selectedNetwork.EnableIPv6 !== undefined && (
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-1">IPv6 支持</label>
                        <p className="text-sm text-on-surface">
                          {selectedNetwork.EnableIPv6 ? (
                            <span className="text-status-success-text">已启用</span>
                          ) : (
                            <span className="text-on-surface-variant">未启用</span>
                          )}
                        </p>
                        {!selectedNetwork.EnableIPv6 && selectedNetwork.IPAM?.Config && selectedNetwork.IPAM.Config.length > 1 && (
                          <p className="mt-1 text-xs text-status-warning-text">
                            检测到 IPv6 配置但 EnableIPv6 为 false，可能是 Docker daemon 未启用 IPv6 支持
                          </p>
                        )}
                      </div>
                    )}
                    {selectedNetwork.Internal !== undefined && (
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-1">内部网络</label>
                        <p className="text-sm text-on-surface">
                          {selectedNetwork.Internal ? '是' : '否'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* IPAM 配置 */}
                {selectedNetwork.IPAM?.Config && selectedNetwork.IPAM.Config.length > 0 && (
                  <div className="border-b border-outline-variant/20 pb-4">
                    <h4 className="text-sm font-bold text-page-title mb-3">IP 地址管理 (IPAM)</h4>
                    {selectedNetwork.IPAM.Config.map((config, index) => (
                      <div key={index} className="mb-4 last:mb-0">
                        {selectedNetwork.IPAM!.Config!.length > 1 && (
                          <p className="text-xs text-on-surface-variant mb-2">
                            配置 {index + 1} {index === 0 ? '(IPv4)' : '(IPv6)'}
                          </p>
                        )}
                        <div className="space-y-2 bg-surface-container rounded-lg p-3">
                          {config.Subnet && (
                            <div className="flex justify-between">
                              <span className="text-xs text-on-surface-variant">子网:</span>
                              <span className="text-xs text-on-surface font-mono">{config.Subnet}</span>
                            </div>
                          )}
                          {config.Gateway && (
                            <div className="flex justify-between">
                              <span className="text-xs text-on-surface-variant">网关:</span>
                              <span className="text-xs text-on-surface font-mono">{config.Gateway}</span>
                            </div>
                          )}
                          {config.IPRange && (
                            <div className="flex justify-between">
                              <span className="text-xs text-on-surface-variant">IP 范围:</span>
                              <span className="text-xs text-on-surface font-mono">{config.IPRange}</span>
                            </div>
                          )}
                          {config.AuxiliaryAddresses && Object.keys(config.AuxiliaryAddresses).length > 0 && (
                            <div>
                              <span className="text-xs text-on-surface-variant block mb-1">辅助地址:</span>
                              <div className="space-y-1">
                                {Object.entries(config.AuxiliaryAddresses).map(([key, value]) => (
                                  <div key={key} className="flex justify-between text-xs">
                                    <span className="text-on-surface-variant">{key}:</span>
                                    <span className="text-on-surface font-mono">{value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 驱动选项 */}
                {selectedNetwork.Options && Object.keys(selectedNetwork.Options).length > 0 && (
                  <div className="border-b border-outline-variant/20 pb-4">
                    <h4 className="text-sm font-bold text-page-title mb-3">驱动选项</h4>
                    <div className="bg-surface-container rounded-lg p-3 space-y-2">
                      {Object.entries(selectedNetwork.Options).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-on-surface-variant break-all mr-2">{key}:</span>
                          <span className="text-on-surface font-mono text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 标签 */}
                {selectedNetwork.Labels && Object.keys(selectedNetwork.Labels).length > 0 && (
                  <div className="border-b border-outline-variant/20 pb-4">
                    <h4 className="text-sm font-bold text-page-title mb-3">标签</h4>
                    <div className="bg-surface-container rounded-lg p-3 space-y-2">
                      {Object.entries(selectedNetwork.Labels).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-on-surface-variant break-all mr-2">{key}:</span>
                          <span className="text-on-surface text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 连接的容器 */}
                {selectedNetwork.Containers && Object.keys(selectedNetwork.Containers).length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-page-title mb-3">连接的容器</h4>
                    <div className="bg-surface-container rounded-lg p-3 space-y-2">
                      {Object.entries(selectedNetwork.Containers).map(([id, container]: [string, any]) => (
                        <div key={id} className="text-xs pb-2 last:border-0 last:pb-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-on-surface-variant">容器名称:</span>
                            <span className="text-on-surface">{container.Name || id.slice(0, 12)}</span>
                          </div>
                          {container.IPv4Address && (
                            <div className="flex justify-between">
                              <span className="text-on-surface-variant">IPv4:</span>
                              <span className="text-on-surface font-mono">{container.IPv4Address}</span>
                            </div>
                          )}
                          {container.IPv6Address && (
                            <div className="flex justify-between">
                              <span className="text-on-surface-variant">IPv6:</span>
                              <span className="text-on-surface font-mono">{container.IPv6Address}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 固定底部按钮 */}
            <div className="p-6 pt-4">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-button text-button-secondary w-full"
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
