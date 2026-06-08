'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import Sidebar from '@/components/Sidebar';
import TeacherSidebar from '@/components/TeacherSidebar';
import LoadingBar from '@/components/LoadingBar';
import api, { authAPI, publicClassAPI } from '@/lib/api';
import { roleLabel, ROLE_PROFILE_PILL_LAYOUT_CLASS, roleBadgeColorsStyle } from '@/lib/roleLabels';
import { profilePageCardClass, profilePageFontClass, profilePageMainInnerClass } from '@/lib/profileShell';

interface Activity {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  createdAt: string;
}

function MsCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`${profilePageCardClass} ${className}`}>{children}</div>;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    displayName: '',
    qqNumber: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [publicGroups, setPublicGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (user) {
      setEditForm({
        username: user.username || '',
        displayName: user.displayName || '',
        qqNumber: user.qqNumber || '',
      });
      loadActivities();
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'STUDENT') {
      publicClassAPI.list().then((r) => setPublicGroups(r.data)).catch(() => setPublicGroups([]));
    }
  }, [user?.role]);

  const loadActivities = async () => {
    try {
      const activitiesRes = await api.get('/auth/activities');
      setActivities(activitiesRes.data);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  };

  const handleEdit = () => setIsEditing(true);

  const handleCancel = () => {
    setIsEditing(false);
    if (user) {
      setEditForm({
        username: user.username || '',
        displayName: user.displayName || '',
        qqNumber: user.qqNumber || '',
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put('/auth/profile', editForm);
      await checkAuth();
      setIsEditing(false);
    } catch (error: any) {
      alert(error.response?.data?.message || '更新失败');
    } finally {
      setIsSaving(false);
    }
  };

  const getAvatarUrl = () => {
    if (user?.avatar) {
      return user.avatar;
    }
    if (user?.qqNumber) {
      return `https://q1.qlogo.cn/g?b=qq&nk=${user.qqNumber}&s=640`;
    }
    return `https://ui-avatars.com/api/?name=${user?.displayName}&background=6366f1&color=fff&size=200`;
  };

  const inputClass =
    'w-full rounded-full bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none transition-shadow focus:ring-2 focus:ring-primary/30 dark:bg-surface-container/80';

  const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:opacity-90 disabled:opacity-50';

  const btnDefault =
    'inline-flex items-center justify-center gap-2 rounded-full bg-surface-container px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright dark:bg-surface-container/80';

  /** QQ 号标签（头像下方） */
  const profilePillClass =
    'inline-flex w-full min-w-0 items-center justify-center rounded-full bg-surface-container px-3 py-1.5 text-center text-xs font-medium text-on-surface-variant dark:bg-surface-container/80';

  if (isLoading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const isTeacher = user.role === 'TEACHER';

  return (
    <div className={`flex min-h-screen bg-background text-on-surface ${profilePageFontClass}`}>
      {isTeacher ? <TeacherSidebar /> : <Sidebar />}

      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className={profilePageMainInnerClass}>
          <header className="mb-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">
                  个人资料
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant">
                  管理账户信息与活动记录。
                </p>
              </div>
              {!isEditing ? (
                <button type="button" onClick={handleEdit} className={`${btnPrimary} shrink-0`}>
                  编辑资料
                </button>
              ) : (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={handleCancel} disabled={isSaving} className={btnDefault}>
                    取消
                  </button>
                  <button type="button" onClick={handleSave} disabled={isSaving} className={btnPrimary}>
                    {isSaving ? '保存中…' : '保存'}
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="space-y-10">
            <section aria-label="账户">
              <h2 className="mb-3 text-base font-semibold text-on-surface">账户</h2>
              <MsCard>
                {isEditing ? (
                  <div className="p-6 sm:p-8">
                    <div className="mx-auto max-w-2xl space-y-6">
                      <div className="flex flex-col items-center gap-4 pb-2 sm:flex-row sm:items-center">
                        <img
                          src={getAvatarUrl()}
                          alt=""
                          className="h-36 w-36 shrink-0 rounded-full object-cover shadow-soft sm:h-40 sm:w-40"
                        />
                        <p className="text-center text-sm text-on-surface-variant sm:text-left">
                          头像由 QQ 号同步；修改 QQ 后保存并刷新页面即可更新。
                        </p>
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                            用户名（登录）
                          </label>
                          <input
                            type="text"
                            value={editForm.username}
                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                            显示名称
                          </label>
                          <input
                            type="text"
                            value={editForm.displayName}
                            onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                            QQ 号
                          </label>
                          <input
                            type="text"
                            value={editForm.qqNumber}
                            onChange={(e) => setEditForm({ ...editForm, qqNumber: e.target.value })}
                            placeholder="选填"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start sm:gap-9 sm:p-6">
                    <div className="flex shrink-0 flex-col items-center gap-2.5">
                      <img
                        src={getAvatarUrl()}
                        alt=""
                        className="h-[148px] w-[148px] rounded-full object-cover shadow-soft sm:h-[168px] sm:w-[168px]"
                      />
                      <div className="flex w-full max-w-[168px] flex-col items-center gap-2">
                        <span
                          className={ROLE_PROFILE_PILL_LAYOUT_CLASS}
                          style={roleBadgeColorsStyle(user?.role)}
                        >
                          {roleLabel(user?.role)}
                        </span>
                        {user.qqNumber ? (
                          <span className={`${profilePillClass} tabular-nums`}>QQ {user.qqNumber}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 self-start">
                      <div className="rounded-2xl bg-surface-container/55 px-4 py-5 sm:px-6 sm:py-5 dark:bg-surface-container/35">
                        <header className="mb-6">
                          <p className="text-xs font-semibold tracking-wide text-on-surface-variant">
                            显示名称
                          </p>
                          <h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-on-surface sm:text-[26px]">
                            {user.displayName}
                          </h3>
                        </header>
                        <dl className="space-y-5 sm:space-y-6">
                          <div className="grid gap-2 sm:grid-cols-[minmax(10rem,11rem)_1fr] sm:items-baseline sm:gap-8 lg:grid-cols-[minmax(11rem,13rem)_1fr]">
                            <dt className="text-base font-medium text-on-surface-variant">登录用户名</dt>
                            <dd className="text-lg font-semibold tabular-nums tracking-tight text-on-surface">
                              @{user.username}
                            </dd>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[minmax(10rem,11rem)_1fr] sm:items-baseline sm:gap-8 lg:grid-cols-[minmax(11rem,13rem)_1fr]">
                            <dt className="text-base font-medium text-on-surface-variant">QQ 号</dt>
                            <dd className="text-lg tabular-nums font-medium text-on-surface">
                              {user.qqNumber || (
                                <span className="font-normal text-on-surface-variant">未填写</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                )}
              </MsCard>
            </section>

            {user.role === 'STUDENT' && (
              <section aria-label="学习小组">
                <h2 className="mb-3 text-base font-semibold text-on-surface">学习小组</h2>
                <MsCard>
                  <div className="space-y-4 p-5 sm:p-6">
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      您可同时加入多个公开学习小组，不同小组的课程会一并出现在课程列表中。
                    </p>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                        已加入
                      </p>
                      {(user.studyGroups?.length ?? 0) === 0 ? (
                        <p className="text-sm text-on-surface-variant">尚未加入任何小组，可从下方加入。</p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {user.studyGroups!.map((g) => (
                            <li
                              key={g.id}
                              className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-sm"
                            >
                              <span className="font-medium text-on-surface">{g.name}</span>
                              <button
                                type="button"
                                disabled={groupBusy === g.id}
                                onClick={async () => {
                                  setGroupBusy(g.id);
                                  try {
                                    await authAPI.leaveStudyGroup(g.id);
                                    await checkAuth();
                                  } catch (e: unknown) {
                                    alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '退出失败');
                                  } finally {
                                    setGroupBusy(null);
                                  }
                                }}
                                className="text-xs font-semibold text-error hover:underline disabled:opacity-50"
                              >
                                退出
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                        加入其他小组
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {publicGroups
                          .filter((g) => !(user.studyGroups || []).some((x) => x.id === g.id))
                          .map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              disabled={groupBusy === g.id}
                              onClick={async () => {
                                setGroupBusy(g.id);
                                try {
                                  await authAPI.joinStudyGroup(g.id);
                                  await checkAuth();
                                } catch (e: unknown) {
                                  alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || '加入失败');
                                } finally {
                                  setGroupBusy(null);
                                }
                              }}
                              className="rounded-full border border-outline-variant bg-surface-lowest/80 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50 dark:bg-surface-container/50"
                            >
                              + {g.name}
                            </button>
                          ))}
                      </div>
                      {publicGroups.length === 0 ? (
                        <p className="mt-2 text-xs text-on-surface-variant">暂无可选小组，请待老师创建。</p>
                      ) : null}
                    </div>
                  </div>
                </MsCard>
              </section>
            )}

            <section aria-label="最近活动">
              <h2 className="text-page-title mb-3 text-base font-semibold">最近活动</h2>
              <MsCard className="overflow-hidden">
                {activities.length === 0 ? (
                  <p className="px-6 py-12 text-center text-sm text-on-surface-variant">暂无活动记录</p>
                ) : (
                  <div>
                    <div className="grid grid-cols-[1fr_auto] gap-4 bg-surface-container/35 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant dark:bg-surface-container/20 sm:px-6">
                      <span>说明</span>
                      <span className="tabular-nums">时间</span>
                    </div>
                    <ul className="py-1">
                      {activities.map((activity) => (
                        <li
                          key={activity.id}
                          className="grid grid-cols-1 gap-1 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6 sm:px-6"
                        >
                          <p className="text-sm text-on-surface">
                            {activity.action === 'enroll_course' && `注册了课程《${activity.targetName}》`}
                            {activity.action === 'start_lab' && `开始实验《${activity.targetName}》`}
                            {activity.action === 'start_video' && `开始观看视频《${activity.targetName}》`}
                            {activity.action === 'start_exam' && `开始试卷《${activity.targetName}》`}
                            {activity.action === 'create_container' && `创建了容器`}
                            {activity.action === 'submit_lab' && `提交了实验《${activity.targetName}》`}
                          </p>
                          <p className="text-xs tabular-nums text-on-surface-variant sm:text-right">
                            {new Date(activity.createdAt).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </MsCard>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
