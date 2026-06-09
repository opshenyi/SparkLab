'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import TeacherSidebar from '@/components/TeacherSidebar';
import LoadingBar from '@/components/LoadingBar';
import { teacherAPI } from '@/lib/api';
import { profilePageCardClass, profilePageFontClass, profilePageMainInnerClass } from '@/lib/profileShell';
import { AnimatePresence, motion } from 'framer-motion';

const drawerEase = [0.16, 1, 0.3, 1] as const;

type GroupRow = {
  id: string;
  name: string;
  memberCount?: number;
  iAmAdvisor?: boolean;
  iAmCreator?: boolean;
  canClaimAdvisor?: boolean;
  groupAdvisorName?: string | null;
};

type MemberRow = { id: string; displayName: string; username: string };

export default function TeacherGroupsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [membersExpandedId, setMembersExpandedId] = useState<string | null>(null);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, MemberRow[]>>({});
  const [addUsername, setAddUsername] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const res = await teacherAPI.listGroups();
      setRows(res.data as GroupRow[]);
    } catch (e: unknown) {
      setLoadErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载失败');
      setRows([]);
    }
  }, []);

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
    if (!isAuthenticated || user?.role !== 'TEACHER') return;
    void load();
  }, [isAuthenticated, user, load]);

  useEffect(() => {
    if (membersExpandedId && !rows.some((r) => r.id === membersExpandedId)) {
      setMembersExpandedId(null);
    }
  }, [rows, membersExpandedId]);

  useEffect(() => {
    if (!membersExpandedId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [membersExpandedId]);

  useEffect(() => {
    if (!membersExpandedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMembersExpandedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [membersExpandedId]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy('create');
    try {
      await teacherAPI.createGroup({ name: n });
      setName('');
      await load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '创建失败');
    } finally {
      setBusy(null);
    }
  };

  const onToggleAdvisor = async (g: GroupRow) => {
    if (!g.iAmAdvisor && !g.canClaimAdvisor) return;
    setBusy(g.id);
    try {
      if (g.iAmAdvisor) {
        await teacherAPI.updateGroup(g.id, { releaseAdvisor: true });
      } else {
        await teacherAPI.updateGroup(g.id, { claimAdvisor: true });
      }
      await load();
      await checkAuth();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '操作失败');
    } finally {
      setBusy(null);
    }
  };

  const loadMembers = async (groupId: string) => {
    try {
      const r = await teacherAPI.students(groupId);
      setMembersByGroup((prev) => ({ ...prev, [groupId]: r.data as MemberRow[] }));
    } catch {
      setMembersByGroup((prev) => ({ ...prev, [groupId]: [] }));
    }
  };

  const toggleMembersPanel = (g: GroupRow) => {
    if (!g.iAmAdvisor) return;
    if (membersExpandedId === g.id) {
      setMembersExpandedId(null);
      return;
    }
    setMembersExpandedId(g.id);
    void loadMembers(g.id);
  };

  const onAddMember = async (g: GroupRow) => {
    const u = (addUsername[g.id] || '').trim();
    if (!u) return;
    setBusy(`add-${g.id}`);
    try {
      await teacherAPI.addGroupMember(g.id, { username: u });
      setAddUsername((prev) => ({ ...prev, [g.id]: '' }));
      await loadMembers(g.id);
      await load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '添加失败');
    } finally {
      setBusy(null);
    }
  };

  const onRemoveMember = async (groupId: string, studentId: string) => {
    if (!confirm('确定将该学生移出本组？（不影响账号，仅退出小组）')) return;
    setBusy(`rm-${studentId}`);
    try {
      await teacherAPI.removeGroupMember(groupId, studentId);
      await loadMembers(groupId);
      await load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '移出失败');
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (g: GroupRow) => {
    if (!confirm(`确定删除学习小组「${g.name}」？（需无学生且无课程）`)) return;
    setBusy(g.id);
    try {
      await teacherAPI.deleteGroup(g.id);
      await load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '删除失败');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || isLoggingOut) {
    return <LoadingBar text={isLoggingOut ? '退出中' : undefined} />;
  }
  if (!isAuthenticated || user?.role !== 'TEACHER') {
    return null;
  }

  const drawerGroup = membersExpandedId ? rows.find((r) => r.id === membersExpandedId) : undefined;

  return (
    <div className={`flex min-h-screen bg-background text-on-surface ${profilePageFontClass}`}>
      <TeacherSidebar />
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className={profilePageMainInnerClass}>
          <header className="mb-8">
            <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">学习小组</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant leading-relaxed">
              所有小组公开可见。老师新建小组后会自动成为小组老师；不能接管其他老师的小组。
            </p>
          </header>

          {loadErr && (
            <div className={`mb-6 ${profilePageCardClass} border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200`}>
              {loadErr}
            </div>
          )}

          <section className={`${profilePageCardClass} mb-8 p-6`}>
            <h2 className="mb-4 text-base font-semibold text-on-surface">新建学习小组</h2>
            <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-on-surface-variant mb-1">小组名称</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：开源兴趣组"
                  className="w-full rounded-xl border border-outline-variant bg-surface-container-high px-3 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy === 'create' || !name.trim()}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                创建
              </button>
            </form>
          </section>

          <section>
            <h2 className="mb-4 text-base font-semibold text-on-surface">全部学习小组</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {rows.map((g) => (
                <div key={g.id} className={`${profilePageCardClass} p-5 flex flex-col gap-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-page-title">{g.name}</h3>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        成员 {g.memberCount ?? 0} 人
                        {g.groupAdvisorName ? ` · 小组老师：${g.groupAdvisorName}` : ' · 暂无小组老师'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(g.iAmAdvisor || g.canClaimAdvisor) && (
                      <button
                        type="button"
                        disabled={busy === g.id}
                        onClick={() => onToggleAdvisor(g)}
                        className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          g.iAmAdvisor
                            ? 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
                            : 'bg-surface-container text-primary hover:bg-primary/10'
                        }`}
                      >
                        {g.iAmAdvisor ? '不再担任小组老师' : '担任小组老师'}
                      </button>
                    )}
                    {!g.iAmAdvisor && !g.canClaimAdvisor && (
                      <span className="inline-flex items-center justify-center rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
                        {g.groupAdvisorName ? '已有小组老师' : '仅创建者可担任'}
                      </span>
                    )}
                    {g.iAmAdvisor && (
                      <button
                        type="button"
                        disabled={busy === g.id}
                        onClick={() => toggleMembersPanel(g)}
                        className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                          membersExpandedId === g.id
                            ? 'bg-primary/20 text-primary ring-2 ring-primary/30'
                            : 'bg-surface-container text-primary hover:bg-primary/10'
                        }`}
                      >
                        组员管理
                      </button>
                    )}
                    {(g.iAmCreator || g.iAmAdvisor) && (
                      <button
                        type="button"
                        disabled={busy === g.id}
                        onClick={() => onDelete(g)}
                        className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {rows.length === 0 && !loadErr && (
              <p className="text-sm text-on-surface-variant py-8 text-center">暂无学习小组，请先创建。</p>
            )}
          </section>
        </div>
      </main>

      <AnimatePresence>
        {drawerGroup ? (
          <motion.button
            key="members-drawer-backdrop"
            type="button"
            aria-label="关闭组员管理"
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMembersExpandedId(null)}
          />
        ) : null}
        {drawerGroup ? (
          <motion.aside
            key={`members-drawer-${drawerGroup.id}`}
            className={`fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col ${profilePageCardClass} rounded-none`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="members-drawer-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.34, ease: drawerEase }}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <h2 id="members-drawer-title" className="text-lg font-semibold text-page-title truncate">
                  组员管理 · {drawerGroup.name}
                </h2>
                <p className="mt-1 text-xs text-on-surface-variant">在侧栏中操作，不会影响列表排版。</p>
              </div>
              <button
                type="button"
                onClick={() => setMembersExpandedId(null)}
                className="shrink-0 rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-high hover:text-on-surface"
                aria-label="关闭"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="text-xs text-on-surface-variant mb-4">
                输入学生<strong className="text-on-surface">登录用户名</strong>（非显示名）加入本组；学生也可自行在「个人资料」中加入小组。
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={addUsername[drawerGroup.id] || ''}
                  onChange={(e) => setAddUsername((prev) => ({ ...prev, [drawerGroup.id]: e.target.value }))}
                  placeholder="学生用户名"
                  className="flex-1 rounded-lg border border-outline-variant bg-surface-lowest px-3 py-2 text-sm dark:bg-surface-container/60"
                />
                <button
                  type="button"
                  disabled={busy === `add-${drawerGroup.id}` || !(addUsername[drawerGroup.id] || '').trim()}
                  onClick={() => onAddMember(drawerGroup)}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  加入组内
                </button>
              </div>
              <ul className="mt-6 space-y-2">
                {(membersByGroup[drawerGroup.id] || []).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-lowest/80 px-3 py-2.5 text-sm dark:bg-surface-low/40"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-on-surface">{s.displayName}</span>
                      <span className="text-on-surface-variant ml-2 tabular-nums">@{s.username}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy === `rm-${s.id}`}
                      onClick={() => onRemoveMember(drawerGroup.id, s.id)}
                      className="shrink-0 text-xs font-semibold text-error hover:underline disabled:opacity-50"
                    >
                      移出
                    </button>
                  </li>
                ))}
              </ul>
              {(membersByGroup[drawerGroup.id] || []).length === 0 && (
                <p className="mt-8 text-center text-sm text-on-surface-variant">暂无组员</p>
              )}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
