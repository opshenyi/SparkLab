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
      setError(err.response?.data?.message || 'Failed to fetch containers');
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
      } else if (action === 'restart') {
        await monitorAPI.restartContainer(containerId);
      }
      await fetchContainers();
    } catch (err: any) {
      alert(err.response?.data?.message || `Failed to ${action} container`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'running':
        return 'text-green-500';
      case 'exited':
        return 'text-red-500';
      case 'paused':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStateBadge = (state: string) => {
    switch (state.toLowerCase()) {
      case 'running':
        return 'bg-green-500/20 text-green-500';
      case 'exited':
        return 'bg-red-500/20 text-red-500';
      case 'paused':
        return 'bg-yellow-500/20 text-yellow-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Docker Containers</h2>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Docker Containers</h2>
        <button
          onClick={fetchContainers}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
        >
          Refresh
        </button>
      </div>

      {containers.length === 0 ? (
        <div className="text-gray-400 text-center py-8">No containers found</div>
      ) : (
        <div className="space-y-3">
          {containers.map((container) => (
            <div
              key={container.id}
              className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-semibold">
                      {container.name[0] || container.id}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStateBadge(
                        container.state
                      )}`}
                    >
                      {container.state}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    <div>
                      <span className="text-gray-500">ID:</span> {container.id}
                    </div>
                    <div>
                      <span className="text-gray-500">Image:</span> {container.image}
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span> {container.status}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {container.state.toLowerCase() !== 'running' ? (
                    <button
                      onClick={() => handleAction(container.id, 'start')}
                      disabled={actionLoading === container.id}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded text-sm"
                    >
                      {actionLoading === container.id ? 'Starting...' : 'Start'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleAction(container.id, 'restart')}
                        disabled={actionLoading === container.id}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded text-sm"
                      >
                        {actionLoading === container.id ? 'Restarting...' : 'Restart'}
                      </button>
                      <button
                        onClick={() => handleAction(container.id, 'stop')}
                        disabled={actionLoading === container.id}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded text-sm"
                      >
                        {actionLoading === container.id ? 'Stopping...' : 'Stop'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

