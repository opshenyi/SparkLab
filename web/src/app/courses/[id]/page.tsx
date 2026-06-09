'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { courseAPI, labAPI, courseMaterialAPI } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';
import { courseMetaSubtitles } from '@/lib/courseMetaSubtitles';

export default function CoursePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = (params?.id ?? '') as string;
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [course, setCourse] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadMaterials = async () => {
    if (!courseId) return;
    try {
      const res = await courseMaterialAPI.list(courseId);
      setMaterials(res.data);
    } catch {
      setMaterials([]);
    }
  };

  const loadCourse = async () => {
    try {
      const res = await courseAPI.getOne(courseId);
      setCourse(res.data);
    } catch (error) {
      console.error('Failed to load course:', error);
    }
  };

  const loadLabs = async () => {
    try {
      const res = await labAPI.getByCourse(courseId);
      setLabs(res.data);
    } catch (error) {
      console.error('Failed to load labs:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && courseId) {
      loadCourse();
      loadLabs();
      loadMaterials();
    }
  }, [isAuthenticated, courseId]);

  const handleStartLab = (lab: any) => {
    // 根据类型路由到不同页面
    switch (lab.type) {
      case 'video':
        router.push(`/video/${lab.id}`);
        break;
      case 'exam':
        router.push(`/exam/${lab.id}`);
        break;
      case 'lab':
      default:
        router.push(`/lab/${lab.id}`);
        break;
    }
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated || !course) {
    return null;
  }

  const courseMeta = courseMetaSubtitles(
    course,
    user?.role === 'STUDENT' || user?.role === 'TEACHER' ? 'learner' : 'default'
  );

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <Sidebar />

      <main className="flex-1 lg:ml-64 p-8 pt-20 lg:pt-8">
        <button
          onClick={() => router.push('/explore')}
          className="mb-6 flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
        >
          返回课程中心
        </button>

        {/* 课程头部 */}
        <div className="app-card p-8 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-3">
                {course.title}
              </h1>
              {courseMeta.classLine && (
                <p
                  className={`text-sm mb-2 ${courseMeta.isPublic ? 'text-on-surface-variant' : 'text-primary'}`}
                >
                  {courseMeta.classLine}
                </p>
              )}
              {courseMeta.teacherLine && (
                <p className="text-sm text-on-surface-variant mb-3">{courseMeta.teacherLine}</p>
              )}
              <p className="text-on-surface-variant text-lg mb-4">
                {course.description}
              </p>
            </div>
            <span className={`text-xs font-semibold ml-6 flex-shrink-0 ${
              course.difficulty === 'beginner' 
                ? 'text-status-success-text'
                : course.difficulty === 'intermediate' 
                ? 'text-status-warning-text'
                : 'text-status-error-text'
            }`}>
              {course.difficulty === 'beginner' ? '入门' : course.difficulty === 'intermediate' ? '进阶' : '高级'}
            </span>
          </div>

          <div className="flex items-center gap-6 text-sm text-on-surface-variant">
            <div>
              <span>
                {labs.length + materials.length} 项内容
                {materials.length > 0 && (
                  <span className="text-on-surface-variant/80">
                    （课时 {labs.length} · 课件 {materials.length}）
                  </span>
                )}
              </span>
            </div>
            <div>{course.duration} 分钟</div>
            <div>进度: {course.progress || 0}%</div>
          </div>
        </div>

        {/* 课程内容：课时与课件同一列表（课件在教师/管理端「管理课程」中维护） */}
        <div className="mb-6">
          <h2 className="text-page-title text-2xl font-bold mb-4">课程内容</h2>
          <p className="text-on-surface-variant mb-6">实验、视频、试卷与课件统一在此学习；课件可内嵌或下载打开。</p>
        </div>

        <div className="space-y-4">
          {labs.map((lab, index) => (
            <div
              key={lab.id}
              className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-page-title text-xl font-bold">{lab.title}</h3>
                      <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">
                        {lab.type === 'video' ? '视频' : lab.type === 'exam' ? '试卷' : '实验'}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">
                        {lab.difficulty === 'beginner' ? '入门' : lab.difficulty === 'intermediate' ? '进阶' : '高级'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-on-surface-variant mb-3">
                      {lab.description}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                      <div>{lab.timeLimit} 分钟</div>
                      <div>{lab.points} 分</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleStartLab(lab)}
                  className="w-full bg-primary text-on-primary px-6 py-3 rounded-full hover:opacity-90 transition-all sm:ml-4 sm:w-auto"
                >
                  {lab.type === 'video' ? '观看视频' : lab.type === 'exam' ? '开始答题' : '进入实验'}
                </button>
              </div>
            </div>
          ))}

          {materials.map((m, index) => (
            <div
              key={m.id}
              className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-bold flex-shrink-0">
                    {labs.length + index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-page-title text-xl font-bold">{m.title}</h3>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/15 text-primary">课件</span>
                      {m.completed ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-status-success-bg text-status-success-text">已完成</span>
                      ) : null}
                      <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">
                        {m.fileKind === 'pdf'
                          ? 'PDF'
                          : m.fileKind === 'word'
                            ? 'Word'
                            : m.fileKind === 'ppt'
                              ? 'PPT'
                              : m.fileKind}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-3 line-clamp-2">{m.originalName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/materials/${m.id}`)}
                  className="w-full bg-primary text-on-primary px-6 py-3 rounded-full hover:opacity-90 transition-all sm:ml-4 sm:w-auto shrink-0"
                >
                  查看课件
                </button>
              </div>
            </div>
          ))}

          {labs.length === 0 && materials.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant">
              <p>该课程暂无内容</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
