import { create } from 'zustand';
import { authAPI } from '@/lib/api';

interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
  qqNumber?: string;
  avatar?: string;
  classId?: string;
  className?: string;
  homeroomClass?: { id: string; name: string };
  studyGroups?: { id: string; name: string }[];
  advisedGroups?: { id: string; name: string }[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isLoggingOut: false,

  login: async (username, password) => {
    const response = await authAPI.login({ username, password });
    set({ user: response.data.user, isAuthenticated: true });
  },

  register: async (username, displayName, password) => {
    await authAPI.register({ username, displayName, password });
  },

  logout: async () => {
    set({ isLoggingOut: true });
    
    // 并行执行API调用和等待动画
    await Promise.all([
      authAPI.logout(),
      new Promise(resolve => setTimeout(resolve, 3000)) // 等待3秒进度条动画
    ]);
    
    set({ user: null, isAuthenticated: false, isLoggingOut: false });
  },

  checkAuth: async () => {
    try {
      const response = await authAPI.getProfile();
      
      // 检查新的响应格式
      if (response.data.authenticated && response.data.user) {
        set({ user: response.data.user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error: any) {
      // 网络错误等其他错误
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
