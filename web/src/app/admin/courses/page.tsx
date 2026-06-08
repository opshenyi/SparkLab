'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';

export default function AdminCoursesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();

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
        <div className="p-8 max-w-2xl">
          <h1 className="text-2xl font-bold text-page-title mb-3">课程与学习小组</h1>
          <p className="text-on-surface-variant leading-relaxed mb-6">
            超级管理员与管理员不再管理课程或学习小组。请由老师在「教学管理端」创建学习小组、担任小组老师，并在对应小组下创建与管理课程。
          </p>
          <Link
            href="/teacher/courses"
            className="inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90"
          >
            前往老师端 · 课程管理
          </Link>
        </div>
      </main>
    </div>
  );
}
