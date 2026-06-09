'use client';

import LoadingBar from '@/components/LoadingBar';
import { authAPI } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function destinationForRole(role?: string) {
  if (role === 'ADMIN' || role === 'AUTHOR') return '/admin';
  if (role === 'TEACHER') return '/teacher';
  return '/dashboard';
}

export default function ForcePasswordChangePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!isLoading && isAuthenticated && user && !user.mustChangePassword) {
      router.push(destinationForRole(user.role));
    }
  }, [isAuthenticated, isLoading, router, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword === 'admin123') {
      setError('新密码不能继续使用默认密码 admin123');
      return;
    }

    setIsSaving(true);
    try {
      await authAPI.updatePassword({ currentPassword, newPassword });
      await checkAuth();
      const nextUser = useAuthStore.getState().user;
      router.push(destinationForRole(nextUser?.role || user?.role));
    } catch (err: any) {
      setError(err.response?.data?.message || '密码修改失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !isAuthenticated || !user) {
    return <LoadingBar />;
  }

  const inputClass =
    'w-full rounded-md bg-surface-lowest px-3 py-2.5 text-sm text-on-surface shadow-[var(--shadow-ring)] outline-none transition-shadow focus:ring-2 focus:ring-primary/30';
  const labelClass = 'text-xs font-medium text-on-surface-variant';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-on-surface">
      <section className="w-full max-w-[420px] rounded-md bg-surface-lowest p-6 shadow-[var(--shadow-card)]">
        <div className="mb-6">
          <p className="text-xs font-medium text-on-surface-variant">SparkLab 管理员</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-page-title">
            修改默认密码
          </h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            当前账号仍在使用初始化密码。为保护后台和学生实验环境，请先设置新的管理员密码。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="currentPassword">
              当前密码
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={`${inputClass} mt-1.5`}
              autoComplete="current-password"
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="newPassword">
              新密码
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={`${inputClass} mt-1.5`}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="confirmPassword">
              确认新密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={`${inputClass} mt-1.5`}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          {error ? (
            <div className="rounded-md bg-status-error-bg px-3 py-2 text-sm text-status-error-text">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-10 flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? '保存中' : '保存并继续'}
            </button>
            <button
              type="button"
              onClick={() => logout()}
              disabled={isSaving}
              className="min-h-10 rounded-md bg-surface-low px-4 py-2 text-sm font-medium text-on-surface shadow-[var(--shadow-ring)] transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              退出登录
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
