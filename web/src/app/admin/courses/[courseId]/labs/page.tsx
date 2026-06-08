'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';

/** 管理员不再编排课程实验；旧链接引导至老师端对应路径。 */
export default function AdminCourseLabsRedirectPage() {
  const params = useParams();
  const courseId = params.courseId as string;
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

  if (isLoading || isLoggingOut) {
    return <LoadingBar text={isLoggingOut ? '退出中' : undefined} />;
  }
  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'AUTHOR')) {
    return null;
  }

  const teacherHref = `/teacher/courses/${courseId}/labs`;

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar />
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0 p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-page-title mb-3">课程实验编排已迁移</h1>
        <p className="text-on-surface-variant leading-relaxed mb-6">
          管理员不再在此编辑实验。若您同时需要管理课程，请使用老师账号登录，或让任课老师在教学端操作。
        </p>
        <Link
          href={teacherHref}
          className="inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90"
        >
          打开老师端实验管理
        </Link>
      </main>
    </div>
  );
}
