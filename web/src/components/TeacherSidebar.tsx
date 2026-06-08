'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { getUserAvatarOrInitial } from '@/lib/avatar';
import { roleLabel } from '@/lib/roleLabels';
import { cn } from '@/lib/utils';
import LoadingBar from './LoadingBar';
import ThemeToggleButton from './ThemeToggleButton';

const navLinkItems = [
  // 必须用精确匹配：否则 /teacher/courses、/teacher/students 会命中 /teacher 前缀而误高亮「工作台」
  { label: '学情分析大屏', href: '/teacher', exact: true },
  { label: '学习小组管理', href: '/teacher/groups' },
  { label: '学生学情明细', href: '/teacher/students' },
  { label: '课程管理', href: '/teacher/courses' },
  { label: '星火 AI', href: '/ai-assistant' },
  { label: '个人资料', href: '/profile' },
] as const;

export default function TeacherSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoggingOut } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (isLoggingOut) {
    return <LoadingBar text="退出中" />;
  }

  const linkClass = (isActive: boolean) =>
    cn(
      'group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200',
      isActive
        ? 'bg-surface-high text-on-surface shadow-[var(--shadow-ring)]'
        : 'text-on-surface-variant hover:bg-surface-lowest/85 hover:text-on-surface dark:hover:bg-surface-container/80'
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="fixed left-4 top-4 z-50 rounded-full bg-surface-lowest/90 px-4 py-2 text-sm font-medium text-on-surface shadow-soft-md backdrop-blur-md dark:bg-surface-container/90 lg:hidden"
      >
        {isMobileMenuOpen ? '关闭导航' : '打开导航'}
      </button>

      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-sidebar-blue-vein pb-0 pt-8 text-sm transition-transform duration-300',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="px-6 mb-8">
          <h1 className="font-display text-page-title text-lg font-semibold tracking-tight">
            星火实验室
          </h1>
          <p className="mt-1.5 text-[11px] font-medium uppercase text-on-surface-variant">
            教学管理端
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 pb-4 scrollbar-thin">
          {navLinkItems.map((item) => {
            const exact = 'exact' in item && item.exact;
            const isActive = exact
              ? pathname === item.href || pathname === `${item.href}/`
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={linkClass(isActive)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto w-full px-3 pb-4 pt-4">
          {user && (
            <div className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5">
              <div className="flex-shrink-0">
                {(() => {
                  const avatar = getUserAvatarOrInitial(user);
                  return avatar.type === 'image' ? (
                    <img
                      src={avatar.value}
                      alt={user.displayName}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-white/80 dark:ring-white/10"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                      {avatar.value}
                    </div>
                  );
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">{user.displayName}</p>
                <p className="truncate text-xs text-on-surface-variant">{roleLabel(user.role)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <ThemeToggleButton />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                  title="退出登录"
                >
                  退出
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
