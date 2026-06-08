import { create } from 'zustand';
import { containerAPI } from '@/lib/api';

interface Container {
  id: string;
  labId: string;
  containerId: string;
  status: string;
  sshPort?: number;
  vncPort?: number;
  idePort?: number;
  createdAt: string;
  lastActiveAt: string;
}

interface ContainerState {
  containers: Container[];
  currentContainer: Container | null;
  isLoading: boolean;
  fetchContainers: () => Promise<void>;
  createContainer: (labId: string) => Promise<Container>;
  startContainer: (id: string) => Promise<void>;
  stopContainer: (id: string) => Promise<void>;
  removeContainer: (id: string) => Promise<void>;
  sendHeartbeat: (id: string) => Promise<void>;
}

export const useContainerStore = create<ContainerState>((set, get) => ({
  containers: [],
  currentContainer: null,
  isLoading: false,

  fetchContainers: async () => {
    set({ isLoading: true });
    try {
      const response = await containerAPI.getAll();
      set({ containers: response.data, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  createContainer: async (labId) => {
    const response = await containerAPI.create(labId);
    const newContainer = response.data;
    set((state) => ({
      containers: [newContainer, ...state.containers],
      currentContainer: newContainer,
    }));
    return newContainer;
  },

  startContainer: async (id) => {
    const response = await containerAPI.start(id);
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === id ? response.data : c
      ),
    }));
  },

  stopContainer: async (id) => {
    const response = await containerAPI.stop(id);
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === id ? response.data : c
      ),
    }));
  },

  removeContainer: async (id) => {
    await containerAPI.remove(id);
    set((state) => ({
      containers: state.containers.filter((c) => c.id !== id),
      currentContainer: state.currentContainer?.id === id ? null : state.currentContainer,
    }));
  },

  sendHeartbeat: async (id) => {
    await containerAPI.heartbeat(id);
  },
}));
