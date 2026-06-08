'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, Container, User, LogOut, Shield, Menu, X, Sparkles, GraduationCap } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { getUserAvatarOrInitial } from '@/lib/avatar';
import { roleLabel } from '@/lib/roleLabels';
import { cn } from '@/lib/utils';
import LoadingBar from './LoadingBar';
import ThemeToggleButton from './ThemeToggleButton';

const navItems = [
  { icon: Home, label: '学习大厅', href: '/dashboard', active: true },
  { icon: BookOpen, label: '课程中心', href: '/explore' },
  { icon: Container, label: '我的容器', href: '/containers' },
  { icon: Sparkles, label: '星火 AI', href: '/ai-assistant' },
  { icon: User, label: '个人资料', href: '/profile' },
];

const adminNavItems = [
  { icon: Shield, label: '管理控制台', href: '/admin' },
];

const teacherNavItems = [{ icon: GraduationCap, label: '学情分析大屏', href: '/teacher' }];

function NavLinkIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center transition-colors duration-200',
        active ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'
      )}
    >
      {children}
    </span>
  );
}

export default function Sidebar() {
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
      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
      isActive
        ? 'bg-primary/[0.1] text-primary dark:bg-primary/[0.14]'
        : 'text-on-surface-variant hover:bg-surface-lowest/85 hover:text-on-surface dark:hover:bg-surface-container/80'
    );

  return (
    <>
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 rounded-xl bg-surface-lowest/90 p-2.5 text-primary shadow-soft-md backdrop-blur-md dark:bg-surface-container/90"
      >
        {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-sidebar-blue-vein pb-0 pt-8 text-sm transition-transform duration-300',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="px-6 mb-8">
          <h1 className="font-display text-page-title text-lg font-bold tracking-tight">
            星火<span className="text-primary">实验室</span>
          </h1>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
            Spark Lab
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {(user?.role === 'ADMIN' || user?.role === 'AUTHOR') &&
            adminNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={linkClass(isActive)}
                >
                  <NavLinkIcon active={isActive}>
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </NavLinkIcon>
                  {item.label}
                </Link>
              );
            })}

          {user?.role === 'TEACHER' &&
            teacherNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={linkClass(isActive)}
                >
                  <NavLinkIcon active={isActive}>
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </NavLinkIcon>
                  {item.label}
                </Link>
              );
            })}

          {(user?.role === 'ADMIN' || user?.role === 'AUTHOR' || user?.role === 'TEACHER') && (
            <div className="my-3 h-px bg-outline-variant/25" />
          )}

          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={linkClass(isActive)}
              >
                <NavLinkIcon active={isActive}>
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </NavLinkIcon>
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
                <p className="truncate text-xs text-on-surface-variant">
                  {roleLabel(user.role)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <ThemeToggleButton />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                  title="退出登录"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
