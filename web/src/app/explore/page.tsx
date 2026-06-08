'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { courseAPI } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';
import { courseMetaSubtitles } from '@/lib/courseMetaSubtitles';

export default function ExplorePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadCourses = useCallback(async () => {
    try {
      const response = await courseAPI.getAll();
      setCourses(response.data);
    } catch (error) {
      console.error('Failed to load courses:', error);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  const handleEnroll = async (courseId: string) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    try {
      await courseAPI.enroll(courseId);
      // 重新加载课程列表
      await loadCourses();
    } catch (error: any) {
      console.error('Failed to enroll:', error);
      alert(`注册失败: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleContinue = (courseId: string) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    router.push(`/courses/${courseId}`);
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (isLoggingOut) {
    return <LoadingBar text="退出中" />;
  }

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      {isAuthenticated && <Sidebar />}

      <main className={`flex-1 ${isAuthenticated ? 'lg:ml-64 pt-20 lg:pt-8' : ''} p-8`}>
        {!isAuthenticated && (
          <button
            onClick={() => router.push('/')}
            className="mb-6 flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
          >
            返回首页
          </button>
        )}

        <div className="mb-10">
          <h2 className="font-display text-page-title mb-3 text-4xl font-bold tracking-tight sm:text-5xl">
            课程中心
          </h2>
          <p className="max-w-2xl text-lg leading-relaxed text-on-surface-variant">
            探索精心设计的实战课程，提升你的技术能力
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const isInactive = !course.isActive;
            const meta = courseMetaSubtitles(
              course,
              isAuthenticated && (user?.role === 'STUDENT' || user?.role === 'TEACHER') ? 'learner' : 'default'
            );
            return (
              <div
                key={course.id}
                className={`app-card p-6 transition-all duration-200 flex flex-col h-full ${
                  isInactive 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50'
                }`}
              >
                {/* 标题和难度 - 固定高度 */}
                <div className="flex items-start justify-between mb-3 min-h-[64px]">
                  <h3 className={`text-xl font-bold flex-1 line-clamp-2 ${isInactive ? 'text-on-surface-variant' : 'text-page-title'}`}>
                    {course.title}
                  </h3>
                  <span className={`text-xs font-semibold ml-3 flex-shrink-0 ${
                    course.difficulty === 'beginner' 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : course.difficulty === 'intermediate' 
                      ? 'text-amber-600 dark:text-amber-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {course.difficulty === 'beginner' ? '入门' : course.difficulty === 'intermediate' ? '进阶' : '高级'}
                  </span>
                </div>

                {meta.classLine ? (
                  <p
                    className={`text-xs mb-1 min-h-[18px] ${meta.isPublic ? 'text-on-surface-variant' : 'text-primary'}`}
                  >
                    {meta.classLine}
                  </p>
                ) : (
                  <div className="mb-1 min-h-[18px]" aria-hidden />
                )}
                {meta.teacherLine && (
                  <p className="text-xs text-on-surface-variant mb-3 min-h-[18px]">{meta.teacherLine}</p>
                )}

                {/* 描述 - 固定3行 */}
                <p className="text-sm text-on-surface-variant mb-4 line-clamp-3 min-h-[60px]">
                  {course.description}
                </p>

                {/* 属性标签 - 固定高度 */}
                <div className="flex items-center gap-4 mb-4 text-sm text-on-surface-variant flex-wrap min-h-[24px]">
                  {(course.labCount || 0) > 0 && <span>{course.labCount} 实验</span>}
                  {(course.videoCount || 0) > 0 && <span>{course.videoCount} 视频</span>}
                  {(course.examCount || 0) > 0 && <span>{course.examCount} 试卷</span>}
                  <span>{course.duration} 分钟</span>
                </div>

                {/* 按钮 - 推到底部 */}
                <div className="mt-auto">
                  {isInactive ? (
                    <button
                      disabled
                      className="w-full bg-surface-container text-on-surface-variant py-2 rounded-full cursor-not-allowed"
                    >
                      停课中
                    </button>
                  ) : course.isEnrolled ? (
                    <button
                      onClick={() => handleContinue(course.id)}
                      className="w-full bg-primary text-on-primary py-2 rounded-full hover:opacity-90 transition-all"
                    >
                      进入学习
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEnroll(course.id)}
                      className="w-full bg-surface-container-lowest text-primary py-2 rounded-full hover:bg-primary/10 transition-all"
                    >
                      立即注册
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
