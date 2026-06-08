'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import TeacherSidebar from '@/components/TeacherSidebar';
import LoadingBar from '@/components/LoadingBar';
import CourseManagementView from '@/components/CourseManagementView';
import { profilePageFontClass, profilePageMainInnerClass } from '@/lib/profileShell';

export default function TeacherCoursesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();

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

  if (isLoading || isLoggingOut) {
    return <LoadingBar text={isLoggingOut ? '退出中' : undefined} />;
  }

  if (!isAuthenticated || user?.role !== 'TEACHER') {
    return null;
  }

  return (
    <div className={`flex min-h-screen bg-background text-on-surface ${profilePageFontClass}`}>
      <TeacherSidebar />
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className={profilePageMainInnerClass}>
          <CourseManagementView />
        </div>
      </main>
    </div>
  );
}
