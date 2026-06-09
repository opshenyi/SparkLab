'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { adminAPI, adminClassAPI } from '@/lib/api';
import { roleLabel, ROLE_BADGE_LAYOUT_CLASS, roleBadgeColorsStyle } from '@/lib/roleLabels';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';
import { cn } from '@/lib/utils';

/** 顶部分栏顺序：学生、老师、管理员、超管（四类互斥，不再使用「全部」） */
const ROLE_TAB_ORDER = ['STUDENT', 'TEACHER', 'ADMIN', 'AUTHOR'] as const;
type RoleTab = (typeof ROLE_TAB_ORDER)[number];
type RoleFilter = RoleTab | 'OTHER';

const ROLE_SECTION_META: Record<RoleTab, { title: string }> = {
  AUTHOR: { title: '超管' },
  ADMIN: { title: '管理员' },
  TEACHER: { title: '老师' },
  STUDENT: { title: '学生' },
};

type TableLayout = 'staff' | 'teacher' | 'student' | 'mixed';

function tableLayoutForFilter(f: RoleFilter): TableLayout {
  if (f === 'OTHER') return 'mixed';
  if (f === 'AUTHOR' || f === 'ADMIN') return 'staff';
  if (f === 'TEACHER') return 'teacher';
  return 'student';
}

function colCountForLayout(layout: TableLayout): number {
  switch (layout) {
    case 'staff':
      return 6;
    case 'teacher':
      return 7;
    case 'student':
    case 'mixed':
      return 9;
    default:
      return 9;
  }
}

/** 学习小组相关列 */
function orgCellText(u: any, layout: TableLayout): string {
  if (layout === 'staff') return '';
  if (layout === 'teacher') {
    return u.advisedGroupNames ? String(u.advisedGroupNames) : '未担任小组老师';
  }
  if (layout === 'student') {
    if (u.studyGroupNames) return String(u.studyGroupNames);
    return u.className ? String(u.className) : '—';
  }
  if (u.role === 'STUDENT') {
    if (u.studyGroupNames) return String(u.studyGroupNames);
    return u.className ? String(u.className) : '—';
  }
  if (u.role === 'TEACHER') {
    return u.advisedGroupNames ? String(u.advisedGroupNames) : '未担任小组老师';
  }
  return '—';
}

function labStatsText(u: any, layout: TableLayout): { containers: string; submissions: string } {
  const isStudentRow = u.role === 'STUDENT';
  if (layout === 'student') {
    return {
      containers: String(u._count?.containers ?? 0),
      submissions: String(u._count?.submissions ?? 0),
    };
  }
  if (layout === 'mixed' && isStudentRow) {
    return {
      containers: String(u._count?.containers ?? 0),
      submissions: String(u._count?.submissions ?? 0),
    };
  }
  return { containers: '—', submissions: '—' };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState('');
  const [modalRole, setModalRole] = useState<string>('STUDENT');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('STUDENT');

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

  useEffect(() => {
    if (isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR')) {
      loadData();
    }
  }, [isAuthenticated, user]);

  const knownRoles = useMemo(() => new Set<string>([...ROLE_TAB_ORDER]), []);

  const otherUsersCount = useMemo(
    () => users.reduce((n, u) => n + (knownRoles.has(u.role as string) ? 0 : 1), 0),
    [users, knownRoles]
  );

  useEffect(() => {
    if (roleFilter === 'OTHER' && otherUsersCount === 0) {
      setRoleFilter('STUDENT');
    }
  }, [roleFilter, otherUsersCount]);

  useEffect(() => {
    if (showModal) {
      setModalRole(editingItem?.role ?? 'STUDENT');
    }
  }, [showModal, editingItem]);

  const loadData = async () => {
    try {
      const uRes = await adminAPI.getAllUsers();
      setUsers(uRes.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
    try {
      const cRes = await adminClassAPI.list();
      setClasses(cRes.data);
    } catch (error) {
      console.error('Failed to load study groups:', error);
      setClasses([]);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('确定要删除此用户吗？')) return;
    try {
      await adminAPI.deleteUser(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const role = (formData.get('role') as string) || 'STUDENT';
    const data: any = {
      username: formData.get('username') as string,
      displayName: formData.get('displayName') as string,
      role,
      qqNumber: formData.get('qqNumber') as string,
      classId: role === 'STUDENT' ? (formData.get('classId') as string) ?? '' : null,
    };

    if (password) {
      data.password = password;
    }

    try {
      if (editingItem) {
        await adminAPI.updateUser(editingItem.id, data);
      } else {
        if (!password) {
          alert('创建新用户时密码不能为空');
          return;
        }
        await adminAPI.createUser(data);
      }
      setShowModal(false);
      setEditingItem(null);
      loadData();
    } catch (error) {
      console.error('Failed to save user:', error);
      alert(editingItem ? '更新用户失败' : '创建用户失败，请检查用户名或QQ号是否已存在');
    }
  };

  const getQQAvatar = (qqNumber?: string) => {
    if (!qqNumber) return null;
    return `http://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
  };

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = { AUTHOR: 0, ADMIN: 0, TEACHER: 0, STUDENT: 0 };
    for (const u of users) {
      const r = u.role as string;
      if (r in c) c[r]++;
    }
    return c;
  }, [users]);

  const tableRows = useMemo(() => {
    if (roleFilter === 'OTHER') {
      return users.filter((u) => !knownRoles.has(u.role as string));
    }
    return users.filter((u) => u.role === roleFilter);
  }, [users, roleFilter, knownRoles]);

  const tableLayout = tableLayoutForFilter(roleFilter);
  const tableColCount = colCountForLayout(tableLayout);

  const orgHeaderLabel =
    tableLayout === 'student'
      ? '学习小组'
      : tableLayout === 'teacher'
        ? '担任小组老师'
        : tableLayout === 'mixed'
          ? '小组/带组'
          : '';

  const renderUserRow = (u: any) => {
    const org = orgCellText(u, tableLayout);
    const labs = labStatsText(u, tableLayout);
    return (
      <tr
        key={u.id}
        className="transition-colors hover:bg-surface-container/45 dark:hover:bg-surface-container/35"
      >
        <td className="p-4 w-20">
          <div className="w-10 h-10 flex-shrink-0">
            {u.qqNumber ? (
              <img
                src={getQQAvatar(u.qqNumber) || ''}
                alt={u.displayName || u.username}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                {(u.displayName || u.username).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </td>
        <td className="p-4 text-primary">{u.displayName || '未命名'}</td>
        <td className="p-4 text-on-surface-variant">@{u.username}</td>
        <td className="p-4 text-on-surface-variant">{u.qqNumber || '-'}</td>
        {tableLayout !== 'staff' && (
          <td className="p-4 text-on-surface-variant text-sm">{org}</td>
        )}
        <td className="p-4">
          <span className={ROLE_BADGE_LAYOUT_CLASS} style={roleBadgeColorsStyle(u.role)}>
            {roleLabel(u.role)}
          </span>
        </td>
        {(tableLayout === 'student' || tableLayout === 'mixed') && (
          <>
            <td className="p-4 text-on-surface-variant tabular-nums">{labs.containers}</td>
            <td className="p-4 text-on-surface-variant tabular-nums">{labs.submissions}</td>
          </>
        )}
        <td className="p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingItem(u);
                setCurrentDisplayName(u.displayName || '');
                setShowModal(true);
              }}
              className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-high"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => handleDeleteUser(u.id)}
              className="rounded-full bg-status-error-bg px-3 py-1.5 text-xs font-medium text-status-error-text transition-opacity hover:opacity-85 disabled:opacity-40 disabled:pointer-events-none"
              disabled={
                u.id === user?.id ||
                u.role === 'AUTHOR' ||
                (u.role === 'ADMIN' && user?.role !== 'AUTHOR')
              }
            >
              删除
            </button>
          </div>
        </td>
      </tr>
    );
  };

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
        <div className="p-8 flex-1">
          <div className="mb-8">
            <h2 className="text-4xl font-extrabold font-headline tracking-tight text-page-title mb-2">
              用户管理
            </h2>
            <p className="text-on-surface-variant text-lg">
              管理系统中的所有用户账号
            </p>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            {ROLE_TAB_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  roleFilter === r
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
                )}
              >
                {ROLE_SECTION_META[r].title}
                <span className={cn('ml-1.5 tabular-nums opacity-80', roleFilter === r && 'text-on-primary/90')}>
                  ({roleCounts[r] ?? 0})
                </span>
              </button>
            ))}
            {otherUsersCount > 0 && (
              <button
                type="button"
                onClick={() => setRoleFilter('OTHER')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  roleFilter === 'OTHER'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
                )}
              >
                其他
                <span
                  className={cn('ml-1.5 tabular-nums opacity-80', roleFilter === 'OTHER' && 'text-on-primary/90')}
                >
                  ({otherUsersCount})
                </span>
              </button>
            )}
          </div>

          <div className="mb-4 flex justify-end">
            <button
              onClick={() => {
                setEditingItem(null);
                setCurrentDisplayName('');
                setShowModal(true);
              }}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-all"
            >
              添加用户
            </button>
          </div>

          <div className="rounded-2xl overflow-hidden bg-surface-low shadow-soft-md dark:bg-surface-low dark:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.45)]">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed min-w-[920px]">
              <thead className="bg-surface-high dark:bg-surface-container">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-on-surface-variant w-20">头像</th>
                  <th className="text-left p-4 text-sm font-medium text-on-surface-variant">显示名称</th>
                  <th className="text-left p-4 text-sm font-medium text-on-surface-variant">用户名</th>
                  <th className="text-left p-4 text-sm font-medium text-on-surface-variant">QQ号</th>
                  {tableLayout !== 'staff' && (
                    <th className="text-left p-4 text-sm font-medium text-on-surface-variant">{orgHeaderLabel}</th>
                  )}
                  <th className="text-left p-4 text-sm font-medium text-on-surface-variant w-24">角色</th>
                  {(tableLayout === 'student' || tableLayout === 'mixed') && (
                    <>
                      <th
                        className="text-left p-4 text-sm font-medium text-on-surface-variant w-24"
                        title="仅统计学生个人实验容器"
                      >
                        容器数
                      </th>
                      <th
                        className="text-left p-4 text-sm font-medium text-on-surface-variant w-24"
                        title="仅统计学生实验提交"
                      >
                        提交数
                      </th>
                    </>
                  )}
                  <th className="text-left p-4 text-sm font-medium text-on-surface-variant w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={tableColCount} className="p-12 text-center text-on-surface-variant">
                      该分类下暂无用户
                    </td>
                  </tr>
                ) : (
                  tableRows.map((u) => renderUserRow(u))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </main>

      {/* 模态框 - 用户 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-md rounded-2xl bg-surface-low p-6 shadow-soft-lg dark:bg-surface-container dark:shadow-[0_20px_50px_-15px_rgb(0_0_0/0.55)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-page-title">
                {editingItem ? '编辑用户' : '添加用户'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-primary">
                关闭
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">用户名（登录用）</label>
                <input
                  name="username"
                  defaultValue={editingItem?.username}
                  required
                  placeholder="用于登录"
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_\-]+"
                  title="只能包含字母、数字、下划线和短横线"
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">显示名称</label>
                <input
                  name="displayName"
                  defaultValue={editingItem?.displayName}
                  onChange={(e) => setCurrentDisplayName(e.target.value)}
                  required
                  placeholder="真实姓名"
                  minLength={2}
                  maxLength={40}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">
                  密码 {editingItem && <span className="text-xs">(留空则不修改)</span>}
                </label>
                <input
                  name="password"
                  type="password"
                  required={!editingItem}
                  placeholder={editingItem ? '留空则不修改密码' : ''}
                  minLength={editingItem ? undefined : 6}
                  maxLength={72}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">QQ号（选填）</label>
                <input
                  name="qqNumber"
                  type="text"
                  defaultValue={editingItem?.qqNumber}
                  placeholder="用于获取QQ头像"
                  maxLength={15}
                  pattern="[0-9]*"
                  title="只能包含数字"
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">角色</label>
                <select
                  name="role"
                  value={modalRole}
                  onChange={(e) => setModalRole(e.target.value)}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="STUDENT">学生</option>
                  <option value="TEACHER">老师</option>
                  {user?.role === 'AUTHOR' && <option value="ADMIN">管理员</option>}
                  {user?.role === 'AUTHOR' && (
                    <option value="AUTHOR" disabled={currentDisplayName !== '肖瑞杰'}>
                      超管
                      {currentDisplayName !== '肖瑞杰' ? '（仅「肖瑞杰」）' : ''}
                    </option>
                  )}
                </select>
                {user?.role !== 'AUTHOR' && (
                  <p className="text-xs text-on-surface-variant mt-1">仅超管可分配管理员 / 超管角色</p>
                )}
              </div>

              {modalRole === 'STUDENT' && (
                <div>
                  <label className="block text-sm text-on-surface-variant mb-2">初始学习小组（可选）</label>
                  <select
                    name="classId"
                    key={editingItem?.id ?? 'new'}
                    defaultValue={editingItem?.classId ?? ''}
                    className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">暂不加入</option>
                    {classes.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                    保存后写入一个小组归属；学生仍可在个人资料中加入更多小组。
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-surface-container text-on-surface-variant px-4 py-2 rounded-lg hover:bg-surface-bright transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-lg hover:opacity-90 transition-all"
                >
                  {editingItem ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
