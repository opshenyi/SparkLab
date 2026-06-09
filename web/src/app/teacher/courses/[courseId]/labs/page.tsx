'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { teacherAPI, courseAPI, labAPI, courseMaterialAPI } from '@/lib/api';
import TeacherSidebar from '@/components/TeacherSidebar';
import LoadingBar from '@/components/LoadingBar';
import ExamEditorInline from '@/components/ExamEditorInline';

interface ServerInfo {
  id: string;
  name: string;
  status: string;
}

interface DockerImage {
  id: string;
  tags: string[];
}

const LOCAL_DOCKER_SERVER: ServerInfo = {
  id: 'local-docker',
  name: '本机 Docker',
  status: 'unknown',
};

interface PortMapping {
  containerPort: number;
  hostPort?: number;
  protocol: 'tcp' | 'udp';
}

interface EnvironmentVar {
  name: string;
  value: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  mode: 'ro' | 'rw';
}

export default function TeacherCourseLabsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = (params?.courseId ?? '') as string;
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [editingLab, setEditingLab] = useState<any>(null);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  
  const [portMappings, setPortMappings] = useState<PortMapping[]>([]);
  const [environmentVars, setEnvironmentVars] = useState<EnvironmentVar[]>([]);
  const [volumeMounts, setVolumeMounts] = useState<VolumeMount[]>([]);
  const [draggedLabId, setDraggedLabId] = useState<string | null>(null);
  const [dragOverLabId, setDragOverLabId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<
    { id: string; title: string; originalName: string; fileKind: string }[]
  >([]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialModalTitle, setMaterialModalTitle] = useState('');
  const [materialModalFile, setMaterialModalFile] = useState<File | null>(null);
  const [materialUploading, setMaterialUploading] = useState(false);
  const baseServerOptions = servers.length > 0 ? servers : [LOCAL_DOCKER_SERVER];
  const serverOptions =
    selectedServer && !baseServerOptions.some((server) => server.id === selectedServer)
      ? [...baseServerOptions, { ...LOCAL_DOCKER_SERVER, id: selectedServer }]
      : baseServerOptions;
  const imageSuggestions = Array.from(new Set(images.flatMap((img) => {
    const tags = img.tags?.filter((tag) => tag && tag !== '<none>:<none>') || [];
    return tags.length > 0 ? tags : [img.id.slice(0, 12)];
  })));
  const selectedServerName =
    serverOptions.find((server) => server.id === selectedServer)?.name || LOCAL_DOCKER_SERVER.name;
  const defaultServerId = () => serverOptions[0]?.id || LOCAL_DOCKER_SERVER.id;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    } else if (!isLoading && isAuthenticated && user?.role !== 'TEACHER') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, user, router]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'TEACHER' && courseId) {
      loadCourse();
      loadLabs(courseId);
      loadServers();
      loadMaterials();
    }
  }, [isAuthenticated, user, courseId]);

  useEffect(() => {
    if (selectedServer) {
      loadImages();
    }
  }, [selectedServer]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showCreateMenu && !target.closest('[data-create-menu-root]')) {
        setShowCreateMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCreateMenu]);

  const closeMaterialModal = () => {
    setShowMaterialModal(false);
    setMaterialModalTitle('');
    setMaterialModalFile(null);
    setMaterialUploading(false);
  };

  const handleMaterialModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialModalTitle.trim()) {
      alert('请填写课件标题');
      return;
    }
    if (!materialModalFile) {
      alert('请选择要上传的文件');
      return;
    }
    setMaterialUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', materialModalTitle.trim());
      fd.append('file', materialModalFile);
      const result = await courseMaterialAPI.upload(courseId, fd);
      await loadMaterials();
      closeMaterialModal();
      const newId = (result.data as { id?: string })?.id;
      if (typeof newId === 'string' && newId) {
        router.push(`/materials/${newId}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '上传失败');
      setMaterialUploading(false);
    }
  };

  const loadCourse = async () => {
    try {
      const res = await courseAPI.getOne(courseId);
      setSelectedCourse(res.data);
    } catch (error) {
      console.error('Failed to load course:', error);
    }
  };

  const loadLabs = async (cid: string) => {
    try {
      const res = await teacherAPI.labsByCourse(cid);
      setLabs(res.data);
    } catch (error) {
      console.error('Failed to load labs:', error);
    }
  };

  const loadServers = async () => {
    try {
      const { data } = await teacherAPI.listServers();
      const list = Array.isArray(data) && data.length > 0 ? data : [LOCAL_DOCKER_SERVER];
      setServers(list);
      setSelectedServer((prev) => prev || list[0]?.id || LOCAL_DOCKER_SERVER.id);
    } catch (error) {
      console.error('Failed to load servers:', error);
      setServers([LOCAL_DOCKER_SERVER]);
      setSelectedServer((prev) => prev || LOCAL_DOCKER_SERVER.id);
    }
  };

  const loadMaterials = async () => {
    if (!courseId) return;
    try {
      const res = await courseMaterialAPI.list(courseId);
      setMaterials(res.data);
    } catch {
      setMaterials([]);
    }
  };

  const getServerName = (serverId: string | null) => {
    if (!serverId) return null;
    const server = servers.find(s => s.id === serverId);
    return server ? server.name : '本机 Docker';
  };

  const loadImages = async () => {
    if (!selectedServer) {
      setImages([]);
      return;
    }
    setImages([]);
    try {
      const { data } = await teacherAPI.serverImages(selectedServer);
      setImages(Array.isArray(data.images) ? data.images : []);
    } catch (error) {
      console.error('Failed to load images:', error);
      setImages([]);
    }
  };

  const handleStartEdit = (lab: any) => {
    setEditingLab(lab);
    if (lab.serverId) {
      setSelectedServer(lab.serverId);
    } else {
      setSelectedServer(defaultServerId());
    }
    if (lab.videoUrl) {
      setVideoPreviewUrl(lab.videoUrl);
    }
    const mappings = lab.portMappings ? JSON.parse(lab.portMappings) : [];
    const cleanedMappings = mappings.map((pm: any) => {
      const { random, ...rest } = pm;
      return rest;
    });
    setPortMappings(cleanedMappings);
    setEnvironmentVars(lab.environmentVars ? JSON.parse(lab.environmentVars) : []);
    setVolumeMounts(lab.volumeMounts ? JSON.parse(lab.volumeMounts) : []);
  };

  const handleCancelEdit = () => {
    setEditingLab(null);
    setSelectedServer(defaultServerId());
    setImages([]);
    setPortMappings([]);
    setEnvironmentVars([]);
    setVolumeMounts([]);
    setVideoPreviewUrl('');
  };

  const handleSaveLab = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const labType = formData.get('type') as string || 'lab';
    
    const data: any = {
      courseId: courseId,
      type: labType,
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      content: formData.get('content') as string,
      difficulty: formData.get('difficulty') as string,
      order: parseInt(formData.get('order') as string),
      points: parseInt(formData.get('points') as string),
      timeLimit: parseInt(formData.get('timeLimit') as string) || 60,
    };

    // 视频特定字段
    if (labType === 'video') {
      // 直接使用状态中的videoPreviewUrl，因为它是受控组件
      data.videoUrl = videoPreviewUrl;
      // 视频时长会在前端自动获取，不需要手动输入
      data.videoDuration = parseInt(formData.get('videoDuration') as string) || 0;
    }

    // 实验特定字段
    if (labType === 'lab') {
      data.serverId = formData.get('serverId') as string || null;
      data.dockerImage = ((formData.get('dockerImage') as string) || '').trim();
      if (!data.dockerImage) {
        alert('请填写 Docker 镜像');
        return;
      }
      data.cpuLimit = parseFloat(formData.get('cpuLimit') as string);
      data.memoryLimit = parseInt(formData.get('memoryLimit') as string);
      data.shellCommand = formData.get('shellCommand') as string || '/bin/bash';
      data.restartPolicy = formData.get('restartPolicy') as string;
      data.portMappings = portMappings;
      data.environmentVars = environmentVars;
      data.volumeMounts = volumeMounts;
    }

    try {
      let labId = editingLab?.id;
      
      if (editingLab && editingLab.id) {
        await teacherAPI.updateLab(editingLab.id, data);
      } else {
        const response = await teacherAPI.createLab(data);
        labId = response.data.id;
      }

      // 如果是试卷类型，保存题目
      if (labType === 'exam' && labId) {
        const questions = (window as any).__examQuestions || [];
        if (questions.length > 0) {
          await fetch(`/api/proxy/teacher/labs/${labId}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ questions }),
          });
        }
      }

      handleCancelEdit();
      await loadLabs(courseId);
    } catch (error: any) {
      console.error('Failed to save lab:', error);
      const errorMessage = error.response?.data?.message || error.message || '未知错误';
      alert(`保存失败: ${errorMessage}`);
    }
  };

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedVideoExts = ['.mp4', '.m4v', '.mov', '.webm', '.ogv'];
    const lowerName = file.name.toLowerCase();
    if (!allowedVideoExts.some((ext) => lowerName.endsWith(ext))) {
      alert('请选择 mp4、m4v、mov、webm 或 ogv 视频文件');
      return;
    }

    setUploadingVideo(true);

    try {
      // 上传到服务器
      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch('/api/upload/video', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `上传失败 (${response.status})`);
      }

      const result = await response.json();
      setVideoPreviewUrl(result.url);

      // 获取视频时长
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Math.floor(video.duration);
        const durationInput = document.querySelector('input[name="videoDuration"]') as HTMLInputElement;
        if (durationInput) {
          durationInput.value = duration.toString();
        }
      };
      video.src = result.url;

      alert('视频上传成功！');
    } catch (error) {
      console.error('Failed to upload video:', error);
      alert(error instanceof Error ? error.message : '视频上传失败，请重试');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleVideoUrlChange = (url: string) => {
    setVideoPreviewUrl(url);
    
    // 如果是URL，尝试获取视频时长
    if (url && url.startsWith('http')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Math.floor(video.duration);
        const durationInput = document.querySelector('input[name="videoDuration"]') as HTMLInputElement;
        if (durationInput) {
          durationInput.value = duration.toString();
        }
      };
      video.onerror = () => {
        console.error('[DEBUG] Failed to load video metadata');
      };
      video.src = url;
    }
  };

  const handleDeleteLab = async (_id: string) => {
    alert('课时删除已关闭。如需调整请联系管理员或通过停课管理课程可见性。');
  };

  const addPortMapping = () => {
    setPortMappings([...portMappings, {
      containerPort: 80,
      hostPort: 8080,
      protocol: 'tcp',
    }]);
  };

  const removePortMapping = (index: number) => {
    setPortMappings(portMappings.filter((_, i) => i !== index));
  };

  const updatePortMapping = (index: number, field: keyof PortMapping, value: any) => {
    const updated = [...portMappings];
    updated[index] = { ...updated[index], [field]: value };
    setPortMappings(updated);
  };

  const getRandomPort = async (index: number) => {
    if (!selectedServer) {
      alert('本机 Docker 暂不可用');
      return;
    }

    try {
      const response = await teacherAPI.serverAvailablePort(selectedServer);
      const port = response.data.port;
      updatePortMapping(index, 'hostPort', port);
    } catch (error) {
      console.error('Failed to get available port:', error);
      alert('获取可用端口失败，请确认本机 Docker 正在运行');
    }
  };

  const addEnvironmentVar = () => {
    setEnvironmentVars([...environmentVars, { name: '', value: '' }]);
  };

  const removeEnvironmentVar = (index: number) => {
    setEnvironmentVars(environmentVars.filter((_, i) => i !== index));
  };

  const updateEnvironmentVar = (index: number, field: keyof EnvironmentVar, value: string) => {
    const updated = [...environmentVars];
    updated[index] = { ...updated[index], [field]: value };
    setEnvironmentVars(updated);
  };

  const addVolumeMount = () => {
    setVolumeMounts([...volumeMounts, { hostPath: '', containerPath: '', mode: 'rw' }]);
  };

  const removeVolumeMount = (index: number) => {
    setVolumeMounts(volumeMounts.filter((_, i) => i !== index));
  };

  const updateVolumeMount = (index: number, field: keyof VolumeMount, value: string) => {
    const updated = [...volumeMounts];
    updated[index] = { ...updated[index], [field]: value as any };
    setVolumeMounts(updated);
  };

  const handleDragStart = (e: React.DragEvent, labId: string) => {
    setDraggedLabId(labId);
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽图像为半透明
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragOver = (e: React.DragEvent, labId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedLabId && draggedLabId !== labId) {
      setDragOverLabId(labId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只有当离开整个卡片时才清除
    if (e.currentTarget === e.target) {
      setDragOverLabId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetLabId: string) => {
    e.preventDefault();
    setDragOverLabId(null);
    
    if (!draggedLabId || draggedLabId === targetLabId) {
      setDraggedLabId(null);
      return;
    }

    const draggedIndex = labs.findIndex(lab => lab.id === draggedLabId);
    const targetIndex = labs.findIndex(lab => lab.id === targetLabId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedLabId(null);
      return;
    }

    // 重新排序
    const newLabs = [...labs];
    const [draggedLab] = newLabs.splice(draggedIndex, 1);
    newLabs.splice(targetIndex, 0, draggedLab);

    // 更新order字段
    const updatedLabs = newLabs.map((lab, index) => ({
      ...lab,
      order: index + 1
    }));

    setLabs(updatedLabs);
    setDraggedLabId(null);

    // 批量更新顺序到后端
    try {
      await Promise.all(
        updatedLabs.map(lab =>
          teacherAPI.updateLab(lab.id, { order: lab.order })
        )
      );
    } catch (error) {
      console.error('Failed to update order:', error);
      alert('更新顺序失败，请刷新页面重试');
      await loadLabs(courseId);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedLabId(null);
    setDragOverLabId(null);
    // 恢复透明度
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (isLoggingOut) {
    return <LoadingBar text="退出中" />;
  }

  if (!isAuthenticated || user?.role !== 'TEACHER') {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <TeacherSidebar />

      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className="p-8 flex-1">
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={() => router.push('/teacher/courses')}
                className="text-on-surface-variant hover:text-primary"
              >
                返回课程管理
              </button>
            </div>
            <h2 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-2">
              管理课程内容
            </h2>
            <p className="text-on-surface-variant text-lg">
              {selectedCourse ? selectedCourse.title : '加载中...'} - 共 {labs.length} 项内容
            </p>
          </div>

          {!editingLab ? (
            <>
              <div className="mb-6 relative" data-create-menu-root>
                <button
                  type="button"
                  onClick={() => setShowCreateMenu(!showCreateMenu)}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-all"
                >
                  新建内容
                  <span className="text-xs">{showCreateMenu ? '收起' : '展开'}</span>
                </button>

                {showCreateMenu && (
                  <div className="absolute top-full left-0 mt-2 bg-surface-container-high rounded-lg shadow-lg overflow-hidden z-20 min-w-[200px]">
                    {(
                      [
                        {
                          label: '实验',
                          onSelect: () => {
                            setEditingLab({ type: 'lab' });
                            setSelectedServer(defaultServerId());
                            setImages([]);
                            setPortMappings([]);
                            setEnvironmentVars([]);
                            setVolumeMounts([]);
                          },
                        },
                        {
                          label: '视频',
                          onSelect: () => {
                            setEditingLab({ type: 'video' });
                            setSelectedServer(defaultServerId());
                            setImages([]);
                            setPortMappings([]);
                            setEnvironmentVars([]);
                            setVolumeMounts([]);
                          },
                        },
                        {
                          label: '试卷',
                          onSelect: () => {
                            setEditingLab({ type: 'exam' });
                            setSelectedServer(defaultServerId());
                            setImages([]);
                            setPortMappings([]);
                            setEnvironmentVars([]);
                            setVolumeMounts([]);
                          },
                        },
                        {
                          label: '课件',
                          onSelect: () => {
                            setMaterialModalTitle('');
                            setMaterialModalFile(null);
                            setShowMaterialModal(true);
                          },
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          item.onSelect();
                          setShowCreateMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {showMaterialModal && (
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="material-modal-title"
                  onMouseDown={(e) => {
                    if (materialUploading) return;
                    if (e.target === e.currentTarget) closeMaterialModal();
                  }}
                >
                  <div className="app-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 id="material-modal-title" className="text-xl font-bold text-page-title">
                          新建课件
                        </h3>
                        <p className="text-sm text-on-surface-variant mt-1">
                          填写标题并上传文件，学生将在课程学习页的「课程内容」中与课时一起查看，适合课堂展示。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeMaterialModal}
                        disabled={materialUploading}
                        className="text-sm text-on-surface-variant hover:text-primary px-2 py-1 rounded-lg disabled:opacity-40"
                        aria-label="关闭"
                      >
                        关闭
                      </button>
                    </div>
                    <form onSubmit={handleMaterialModalSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-2">课件标题（展示给学生）*</label>
                        <input
                          value={materialModalTitle}
                          onChange={(e) => setMaterialModalTitle(e.target.value)}
                          required
                          placeholder="例如：第 3 周 · 进程与线程讲义"
                          className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-2">课件文件 *</label>
                        <p className="text-xs text-on-surface-variant mb-2">
                          支持 PDF、Word（.doc/.docx）、PowerPoint（.ppt/.pptx），单文件最大 40MB。
                        </p>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                          className="w-full text-sm text-on-surface file:mr-3 file:rounded-lg file:border-0 file:bg-primary/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
                          onChange={(e) => setMaterialModalFile(e.target.files?.[0] ?? null)}
                        />
                        {materialModalFile && (
                          <p className="text-xs text-on-surface-variant mt-2 truncate" title={materialModalFile.name}>
                            已选：{materialModalFile.name}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={closeMaterialModal}
                          disabled={materialUploading}
                          className="flex-1 bg-surface-container text-on-surface-variant px-4 py-2.5 rounded-lg hover:bg-surface-bright transition-all disabled:opacity-50"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          disabled={materialUploading}
                          className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-lg hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                          {materialUploading ? '上传中…' : '上传并保存'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <h3 className="text-page-title text-lg font-semibold mb-4">课时与课件</h3>
              <p className="text-sm text-on-surface-variant mb-4">
                实验 / 视频 / 试卷与课件在同一列表中；课件有独立学习页（与实验等一致）。排序：课时可拖拽，课件在课时之后。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
                {labs.map((lab: any, index: number) => (
                  <div 
                    key={lab.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, lab.id)}
                    onDragOver={(e) => handleDragOver(e, lab.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, lab.id)}
                    onDragEnd={handleDragEnd}
                    className={`app-card p-6 flex flex-col transition-all duration-200 relative ${
                      draggedLabId === lab.id 
                        ? 'opacity-40 scale-95 cursor-grabbing' 
                        : dragOverLabId === lab.id
                        ? 'ring-2 ring-primary/60 scale-[1.01]'
                        : 'hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50 cursor-grab'
                    }`}
                  >
                    {/* 拖拽目标指示器 */}
                    {dragOverLabId === lab.id && (
                      <div className="absolute inset-0 bg-primary/10 rounded-xl pointer-events-none flex items-center justify-center">
                        <div className="bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-sm">
                          放置到这里
                        </div>
                      </div>
                    )}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <h4 className="text-lg font-bold text-page-title flex-1 pr-2">{lab.title}</h4>
                      </div>
                      {/* 类型标签 - 右上角 */}
                      <span className="text-xs px-2 py-1 rounded-full flex-shrink-0 bg-surface-container text-on-surface-variant">
                        {lab.type === 'video' ? '视频' : lab.type === 'exam' ? '试卷' : '实验'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-on-surface-variant mb-4 line-clamp-2 flex-grow">
                      {lab.description}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant mb-4">
                      <span className="bg-surface-container px-2 py-1 rounded">
                        序号 {lab.order || index + 1}
                      </span>
                      <span className="bg-surface-container px-2 py-1 rounded">
                        {lab.difficulty === 'beginner' ? '入门' : lab.difficulty === 'intermediate' ? '进阶' : '高级'}
                      </span>
                      <span className="bg-surface-container px-2 py-1 rounded">{lab.points} 分</span>
                      {lab.type === 'lab' && (
                        <span className="bg-surface-container px-2 py-1 rounded">
                          {lab.serverId ? `${getServerName(lab.serverId)}已绑定` : '本机 Docker'}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      {/* 预览按钮 */}
                      <button
                        onClick={() => {
                          // 根据类型跳转到对应的预览页面
                          const previewUrl = lab.type === 'video' ? `/video/${lab.id}` :
                                           lab.type === 'exam' ? `/exam/${lab.id}` :
                                           `/lab/${lab.id}`;
                          window.open(previewUrl, '_blank');
                        }}
                        className="w-full bg-surface-container text-primary px-3 py-2.5 rounded-lg hover:bg-surface-bright transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        预览{lab.type === 'video' ? '视频' : lab.type === 'exam' ? '试卷' : '实验'}
                      </button>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleStartEdit(lab)}
                          className="bg-surface-container text-primary px-2 py-2 rounded-lg hover:bg-surface-bright transition-all flex items-center justify-center gap-1 text-xs"
                          title={lab.type === 'exam' ? '编辑试卷' : lab.type === 'video' ? '编辑视频' : '编辑实验'}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteLab(lab.id)}
                          className="flex items-center justify-center gap-1 rounded-lg bg-status-error-bg px-2 py-2 text-xs text-status-error-text transition-opacity hover:opacity-85"
                          title="删除实验"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {materials.map((m) => (
                  <div
                    key={`mat-${m.id}`}
                    className="app-card p-6 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-lg font-bold text-page-title flex-1 pr-2 line-clamp-2">{m.title}</h4>
                      <span className="text-xs px-2 py-1 rounded-full flex-shrink-0 bg-primary/15 text-primary">
                        课件 ·{' '}
                        {m.fileKind === 'pdf'
                          ? 'PDF'
                          : m.fileKind === 'word'
                            ? 'Word'
                            : m.fileKind === 'ppt'
                              ? 'PPT'
                              : m.fileKind}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-4 line-clamp-2 flex-grow">{m.originalName}</p>
                    <div className="space-y-2 mt-auto">
                      <button
                        type="button"
                        onClick={() => window.open(`/materials/${m.id}`, '_blank', 'noopener,noreferrer')}
                        className="w-full bg-surface-container text-primary px-3 py-2.5 rounded-lg hover:bg-surface-bright transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        查看课件
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('确定删除该课件？')) return;
                          try {
                            await courseMaterialAPI.remove(m.id);
                            await loadMaterials();
                          } catch {
                            alert('删除失败');
                          }
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-status-error-bg px-3 py-2 text-sm font-medium text-status-error-text transition-opacity hover:opacity-85"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}

                {labs.length === 0 && materials.length === 0 && (
                  <div className="text-center py-12 text-on-surface-variant md:col-span-2 xl:col-span-3">
                    <p>该课程暂无课时与课件</p>
                    <p className="text-sm mt-2">点击「新建内容」添加实验、视频、试卷或课件</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="app-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-page-title">
                  {editingLab.id ? 
                    (editingLab.type === 'video' ? '编辑视频' : editingLab.type === 'exam' ? '编辑试卷' : '编辑实验') : 
                    (editingLab.type === 'video' ? '新建视频' : editingLab.type === 'exam' ? '新建试卷' : '新建实验')
                  }
                </h3>
                <button onClick={handleCancelEdit} className="text-sm text-on-surface-variant hover:text-primary">
                  关闭
                </button>
              </div>
              <form onSubmit={handleSaveLab} className="space-y-6">
                {/* 隐藏的类型字段 */}
                <input type="hidden" name="type" value={editingLab.type || 'lab'} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm text-on-surface-variant mb-2">实验名称 *</label>
                    <input
                      name="title"
                      defaultValue={editingLab.title || ''}
                      required
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-on-surface-variant mb-2">实验描述</label>
                    <textarea
                      name="description"
                      defaultValue={editingLab.description || ''}
                      rows={2}
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-on-surface-variant mb-2">实验内容（Markdown）</label>
                    <textarea
                      name="content"
                      defaultValue={editingLab.content || ''}
                      rows={6}
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">排序 *</label>
                    <input
                      name="order"
                      type="number"
                      defaultValue={editingLab.order || labs.length + 1}
                      required
                      min="1"
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">难度 *</label>
                    <select
                      name="difficulty"
                      defaultValue={editingLab.difficulty || 'beginner'}
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="beginner">入门</option>
                      <option value="intermediate">进阶</option>
                      <option value="advanced">高级</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">分数 *</label>
                    <input
                      name="points"
                      type="number"
                      defaultValue={editingLab.points || 100}
                      required
                      min="1"
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-on-surface-variant mb-2">时间限制（分钟）</label>
                    <input
                      name="timeLimit"
                      type="number"
                      defaultValue={editingLab.timeLimit || 60}
                      min="1"
                      className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* 视频特定字段 */}
                {editingLab.type === 'video' && (
                  <div className="pt-6">
                    <h4 className="text-lg font-bold text-page-title mb-4">视频配置</h4>
                    <div className="space-y-4">
                      {/* 视频URL输入 */}
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-2">视频URL</label>
                        <input
                          type="text"
                          value={videoPreviewUrl}
                          onChange={(e) => handleVideoUrlChange(e.target.value)}
                          placeholder="https://example.com/video.mp4 或上传本地视频"
                          className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input type="hidden" name="videoUrl" value={videoPreviewUrl} />
                      </div>

                      {/* 本地视频上传 */}
                      <div>
                        <label className="block text-sm text-on-surface-variant mb-2">或上传本地视频</label>
                        <input
                          type="file"
                          accept=".mp4,.m4v,.mov,.webm,.ogv,video/mp4,video/quicktime,video/webm,video/ogg"
                          onChange={handleVideoFileUpload}
                          disabled={uploadingVideo}
                          className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-on-primary file:cursor-pointer hover:file:opacity-90"
                        />
                        {uploadingVideo && (
                          <p className="text-sm text-on-surface-variant mt-2">处理视频中...</p>
                        )}
                      </div>

                      {/* 视频预览 */}
                      {videoPreviewUrl && (
                        <div>
                          <label className="block text-sm text-on-surface-variant mb-2">视频预览</label>
                          <video
                            src={videoPreviewUrl}
                            controls
                            className="w-full max-h-64 bg-black rounded-lg"
                          />
                        </div>
                      )}

                      {/* 隐藏的时长字段（自动获取） */}
                      <input
                        type="hidden"
                        name="videoDuration"
                        defaultValue={editingLab.videoDuration || 0}
                      />
                    </div>
                  </div>
                )}

                {/* 试卷编辑器 - 仅试卷类型显示 */}
                {editingLab.type === 'exam' && (
                  <div className="pt-6">
                    <h4 className="text-lg font-bold text-page-title mb-4">试卷题目</h4>
                    <ExamEditorInline examId={editingLab.id} />
                  </div>
                )}

                {/* 容器配置 - 仅实验类型显示 */}
                {editingLab.type === 'lab' && (
                <>
                <div className="pt-6">
                  <h4 className="text-lg font-bold text-page-title mb-4">
                    容器配置
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">本机 Docker</label>
                      <input type="hidden" name="serverId" value={selectedServer || LOCAL_DOCKER_SERVER.id} />
                      <select
                        value={selectedServer || LOCAL_DOCKER_SERVER.id}
                        onChange={(e) => setSelectedServer(e.target.value)}
                        disabled
                        className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {serverOptions.map(server => (
                          <option key={server.id} value={server.id}>
                            {server.name || selectedServerName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">Docker 镜像 *</label>
                      <input
                        name="dockerImage"
                        list="teacher-lab-docker-images"
                        defaultValue={editingLab.dockerImage || 'ubuntu:22.04'}
                        required
                        placeholder="ubuntu:22.04"
                        className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <datalist id="teacher-lab-docker-images">
                        {imageSuggestions.map((image) => (
                          <option key={image} value={image} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">CPU 限制（核） *</label>
                      <input
                        name="cpuLimit"
                        type="number"
                        step="0.1"
                        defaultValue={editingLab.cpuLimit || 1.0}
                        required
                        min="0.1"
                        max="16"
                        className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">内存限制（MB） *</label>
                      <input
                        name="memoryLimit"
                        type="number"
                        defaultValue={editingLab.memoryLimit || 512}
                        required
                        min="128"
                        step="128"
                        className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">进入容器的 Bash 命令</label>
                      <input
                        name="shellCommand"
                        defaultValue={editingLab.shellCommand || '/bin/bash'}
                        placeholder="/bin/bash"
                        className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-on-surface-variant mb-2">重启策略</label>
                      <select
                        name="restartPolicy"
                        defaultValue={editingLab.restartPolicy || 'unless-stopped'}
                        className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="no">不重启</option>
                        <option value="always">始终重启</option>
                        <option value="unless-stopped">除非停止</option>
                        <option value="on-failure">失败时重启</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-page-title">
                      端口映射
                    </h4>
                    <button
                      type="button"
                      onClick={addPortMapping}
                      className="bg-primary/20 text-primary px-3 py-1 rounded-lg text-sm hover:bg-primary/30 transition-all flex items-center gap-1"
                    >
                      添加端口
                    </button>
                  </div>

                  {portMappings.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">暂未配置端口映射</p>
                  ) : (
                    <div className="space-y-3">
                      {portMappings.map((pm, index) => (
                        <div key={index} className="flex gap-3 items-center bg-surface-container p-3 rounded-lg">
                          <div className="flex-1">
                            <label className="text-xs text-on-surface-variant mb-1 block">容器端口</label>
                            <input
                              type="number"
                              value={pm.containerPort}
                              onChange={(e) => updatePortMapping(index, 'containerPort', parseInt(e.target.value))}
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-on-surface-variant mb-1 block">主机端口</label>
                            <input
                              type="number"
                              value={pm.hostPort || ''}
                              onChange={(e) => updatePortMapping(index, 'hostPort', parseInt(e.target.value))}
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                          </div>
                          <div className="w-24">
                            <label className="text-xs text-on-surface-variant mb-1 block">协议</label>
                            <select
                              value={pm.protocol}
                              onChange={(e) => updatePortMapping(index, 'protocol', e.target.value)}
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            >
                              <option value="tcp">TCP</option>
                              <option value="udp">UDP</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => getRandomPort(index)}
                            className="bg-primary/20 text-primary px-3 py-1 rounded text-xs hover:bg-primary/30 transition-all"
                          >
                            随机端口
                          </button>
                          <button
                            type="button"
                            onClick={() => removePortMapping(index)}
                            className="rounded px-2 py-1 text-sm text-status-error-text transition-colors hover:text-status-error"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-page-title">
                      环境变量
                    </h4>
                    <button
                      type="button"
                      onClick={addEnvironmentVar}
                      className="bg-primary/20 text-primary px-3 py-1 rounded-lg text-sm hover:bg-primary/30 transition-all flex items-center gap-1"
                    >
                      添加变量
                    </button>
                  </div>

                  {environmentVars.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">暂未配置环境变量</p>
                  ) : (
                    <div className="space-y-3">
                      {environmentVars.map((ev, index) => (
                        <div key={index} className="flex gap-3 items-center bg-surface-container p-3 rounded-lg">
                          <div className="flex-1">
                            <label className="text-xs text-on-surface-variant mb-1 block">变量名</label>
                            <input
                              type="text"
                              value={ev.name}
                              onChange={(e) => updateEnvironmentVar(index, 'name', e.target.value)}
                              placeholder="MYSQL_ROOT_PASSWORD"
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-on-surface-variant mb-1 block">变量值</label>
                            <input
                              type="text"
                              value={ev.value}
                              onChange={(e) => updateEnvironmentVar(index, 'value', e.target.value)}
                              placeholder="123456"
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEnvironmentVar(index)}
                            className="rounded px-2 py-1 text-sm text-status-error-text transition-colors hover:text-status-error"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-page-title">
                      卷挂载
                    </h4>
                    <button
                      type="button"
                      onClick={addVolumeMount}
                      className="bg-primary/20 text-primary px-3 py-1 rounded-lg text-sm hover:bg-primary/30 transition-all flex items-center gap-1"
                    >
                      添加挂载
                    </button>
                  </div>

                  {volumeMounts.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">暂未配置卷挂载</p>
                  ) : (
                    <div className="space-y-3">
                      {volumeMounts.map((vm, index) => (
                        <div key={index} className="flex gap-3 items-center bg-surface-container p-3 rounded-lg">
                          <div className="flex-1">
                            <label className="text-xs text-on-surface-variant mb-1 block">主机路径</label>
                            <input
                              type="text"
                              value={vm.hostPath}
                              onChange={(e) => updateVolumeMount(index, 'hostPath', e.target.value)}
                              placeholder="/mydata/mysql/data"
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-on-surface-variant mb-1 block">容器路径</label>
                            <input
                              type="text"
                              value={vm.containerPath}
                              onChange={(e) => updateVolumeMount(index, 'containerPath', e.target.value)}
                              placeholder="/var/lib/mysql"
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                          </div>
                          <div className="w-24">
                            <label className="text-xs text-on-surface-variant mb-1 block">权限</label>
                            <select
                              value={vm.mode}
                              onChange={(e) => updateVolumeMount(index, 'mode', e.target.value)}
                              className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            >
                              <option value="rw">读写</option>
                              <option value="ro">只读</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeVolumeMount(index)}
                            className="rounded px-2 py-1 text-sm text-status-error-text transition-colors hover:text-status-error"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                </>
                )}

                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="flex-1 bg-surface-container text-on-surface-variant px-4 py-2 rounded-lg hover:bg-surface-bright transition-all"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-lg hover:opacity-90 transition-all"
                  >
                    {editingLab.type === 'video' ? '保存视频' : editingLab.type === 'exam' ? '保存试卷' : '保存实验'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
