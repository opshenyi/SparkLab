import axios from 'axios';

// 使用 Next.js API 路由作为代理 - 所有请求都通过 /api/proxy/*
// 这样用户只需连接到前端，前端内部再连接到后端。
const api = axios.create({
  baseURL: '/api/proxy',
  withCredentials: true,
  timeout: 120_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 处理401错误
    if (error.response?.status === 401) {
      // 未授权，跳转到登录页（排除登录、注册和首页）
      if (typeof window !== 'undefined' && 
          !window.location.pathname.includes('/login') &&
          !window.location.pathname.includes('/register') &&
          window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ==================== Auth API ====================
export const authAPI = {
  register: (data: {
    username: string;
    displayName: string;
    password: string;
    qqNumber?: string;
    role?: 'STUDENT' | 'TEACHER';
    classId?: string;
    classIds?: string[];
  }) => api.post('/auth/register', data),

  joinStudyGroup: (classId: string) => api.post('/auth/groups/join', { classId }),

  leaveStudyGroup: (classId: string) => api.post('/auth/groups/leave', { classId }),
  
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data),
  
  logout: () =>
    api.post('/auth/logout'),
  
  getProfile: () =>
    api.get('/auth/profile'),
  
  checkAuth: () =>
    api.get('/auth/check'),
  
  getStats: () =>
    api.get('/auth/stats'),
  
  getActivities: () =>
    api.get('/auth/activities'),
};

// ==================== Course API ====================
export const courseAPI = {
  getAll: () =>
    api.get('/courses'),
  
  getOne: (id: string) =>
    api.get(`/courses/${id}`),
  
  enroll: (id: string) =>
    api.post(`/courses/${id}/enroll`),
  
  getProgress: (id: string) =>
    api.get(`/courses/${id}/progress`),
};

// ==================== Lab API ====================
export const labAPI = {
  getOne: (id: string) =>
    api.get(`/labs/${id}`),
  
  getByCourse: (courseId: string) =>
    api.get(`/labs/course/${courseId}`),
  
  submit: (id: string, code?: string) =>
    api.post(`/labs/${id}/submit`, { code }),
};

// ==================== Container API ====================
export const containerAPI = {
  create: (labId: string) =>
    api.post('/containers', { labId }),
  
  getAll: () =>
    api.get('/containers'),
  
  getOne: (id: string) =>
    api.get(`/containers/${id}`),
  
  start: (id: string) =>
    api.post(`/containers/${id}/start`),
  
  stop: (id: string) =>
    api.post(`/containers/${id}/stop`),
  
  remove: (id: string) =>
    api.delete(`/containers/${id}`),
  
  heartbeat: (id: string) =>
    api.post(`/containers/${id}/heartbeat`),
  
  exec: (id: string, command: string) =>
    api.post(`/containers/${id}/exec`, { command }),
};

// ==================== Admin API ====================
export const adminAPI = {
  getStats: () =>
    api.get('/admin/stats'),
  
  getAllUsers: () =>
    api.get('/admin/users'),
  
  createUser: (data: {
    username: string;
    displayName: string;
    password: string;
    role?: string;
    qqNumber?: string;
    classId?: string | null;
  }) => api.post('/admin/users', data),
  
  updateUser: (
    id: string,
    data: {
      username?: string;
      displayName?: string;
      password?: string;
      role?: string;
      qqNumber?: string;
      classId?: string | null;
    }
  ) => api.put(`/admin/users/${id}`, data),
  
  deleteUser: (id: string) =>
    api.delete(`/admin/users/${id}`),
  
  getAllContainers: () =>
    api.get('/admin/containers'),
  
  forceStopContainer: (id: string) =>
    api.post(`/admin/containers/${id}/force-stop`),
  
  getAvailablePort: (serverId: string) =>
    api.get(`/admin/servers/${serverId}/available-port`),

  checkUpdates: () =>
    api.get('/admin/updates/check'),

  applyUpdate: () =>
    api.post('/admin/updates/apply'),
};

export const publicClassAPI = {
  list: () => api.get('/classes'),
};

export const courseMaterialAPI = {
  list: (courseId: string) => api.get(`/courses/${courseId}/materials`),
  getOne: (materialId: string) => api.get(`/course-materials/${materialId}`),
  /** 使用 fetch 以便 multipart 边界由浏览器自动生成 */
  upload: async (courseId: string, formData: FormData) => {
    const res = await fetch(`/api/proxy/courses/${courseId}/materials`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!res.ok) {
      const msg = (data as { message?: string })?.message || `上传失败 (${res.status})`;
      throw new Error(msg);
    }
    return { data };
  },
  fileUrl: (materialId: string) => `/api/proxy/course-materials/${materialId}/file`,
  remove: (materialId: string) => api.delete(`/course-materials/${materialId}`),
};

export const teacherAPI = {
  listGroups: () => api.get('/teacher/groups'),
  createGroup: (data: { name: string }) => api.post('/teacher/groups', data),
  updateGroup: (
    id: string,
    data: { name?: string; claimAdvisor?: boolean; releaseAdvisor?: boolean }
  ) => api.patch(`/teacher/groups/${id}`, data),
  deleteGroup: (id: string) => api.delete(`/teacher/groups/${id}`),

  addGroupMember: (groupId: string, data: { username?: string; userId?: string }) =>
    api.post(`/teacher/groups/${groupId}/members`, data),
  removeGroupMember: (groupId: string, userId: string) =>
    api.delete(`/teacher/groups/${groupId}/members/${userId}`),

  overview: (groupId: string) => api.get('/teacher/overview', { params: { groupId } }),
  students: (groupId: string) => api.get('/teacher/students', { params: { groupId } }),
  /** 班主任编排实验：只读，对应后端 /teacher/servers* */
  listServers: () => api.get('/teacher/servers'),
  serverImages: (serverId: string) => api.get(`/teacher/servers/${serverId}/images`),
  serverAvailablePort: (serverId: string) =>
    api.get(`/teacher/servers/${serverId}/available-port`),
  listCourses: (groupId?: string) =>
    api.get('/teacher/courses', { params: groupId ? { groupId } : undefined }),
  createCourse: (data: Record<string, unknown>) => api.post('/teacher/courses', data),
  updateCourse: (id: string, data: Record<string, unknown>) => api.put(`/teacher/courses/${id}`, data),
  toggleCourse: (id: string) => api.patch(`/teacher/courses/${id}/toggle-active`),
  labsByCourse: (courseId: string) => api.get(`/teacher/courses/${courseId}/labs`),
  getLab: (id: string) => api.get(`/teacher/labs/${id}`),
  createLab: (data: Record<string, unknown>) => api.post('/teacher/labs', data),
  updateLab: (id: string, data: Record<string, unknown>) => api.put(`/teacher/labs/${id}`, data),
  saveExamQuestions: (labId: string, data: { questions: unknown[] }) =>
    api.post(`/teacher/labs/${labId}/questions`, data),
};

// ==================== Monitor API ====================
export const monitorAPI = {
  getResourceStats: () =>
    api.get('/monitor/resources'),
  
  getDockerContainers: () =>
    api.get('/monitor/docker/containers'),
  
  getContainerStats: (id: string) =>
    api.get(`/monitor/docker/containers/${id}/stats`),
  
  getContainerLogs: (id: string, tail?: number) =>
    api.get(`/monitor/docker/containers/${id}/logs`, { params: { tail } }),
  
  inspectContainer: (id: string) =>
    api.get(`/monitor/docker/containers/${id}`),
  
  startContainer: (id: string) =>
    api.post(`/monitor/docker/containers/${id}/start`),
  
  stopContainer: (id: string) =>
    api.post(`/monitor/docker/containers/${id}/stop`),
  
  restartContainer: (id: string) =>
    api.post(`/monitor/docker/containers/${id}/restart`),
};

// ==================== Volume API ====================
export const volumeAPI = {
  getAll: (serverId: string) =>
    api.get('/volumes', { params: { serverId } }),
  
  getOne: (name: string, serverId: string) =>
    api.get(`/volumes/${name}`, { params: { serverId } }),
  
  create: (data: { serverId: string; name: string; driver?: string; labels?: Record<string, string>; options?: Record<string, string> }) =>
    api.post('/volumes', data),
  
  remove: (name: string, serverId: string, force?: boolean) =>
    api.delete(`/volumes/${name}`, { params: { serverId, force } }),
};
