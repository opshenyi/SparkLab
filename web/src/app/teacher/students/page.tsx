'use client';



import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/store/useAuthStore';

import { teacherAPI } from '@/lib/api';

import TeacherSidebar from '@/components/TeacherSidebar';

import LoadingBar from '@/components/LoadingBar';

import TeacherGroupFilterButtons from '@/components/TeacherGroupFilterButtons';

import { profilePageCardClass, profilePageFontClass, profilePageMainInnerClass } from '@/lib/profileShell';



type RecentSubmission = {

  id: string;

  labId: string;

  labTitle: string;

  labType: string;

  courseId: string;

  courseTitle: string;

  score: number;

  maxScore: number;

  status: string;

  submittedAt: number;

};



type StudentRow = {

  id: string;

  username: string;

  displayName: string;

  createdAt?: number;

  submissionCount?: number;

  passedCount?: number;

  passRatePercent?: number;

  avgScorePercent?: number;

  learningLevel?: string;

  learningLabel?: string;

  recentSubmissions?: RecentSubmission[];

};



function formatRegisteredAt(ts?: number) {

  if (ts == null || ts === 0) return '—';

  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;

  return new Date(ms).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

}



function formatSubmittedAt(ts?: number) {

  if (ts == null || ts === 0) return '—';

  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;

  return new Date(ms).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

}



function submissionStatusText(status: string) {

  if (status === 'passed') return '通过';

  if (status === 'failed') return '未通过';

  return '待批改';

}



function submissionStatusClass(status: string) {

  if (status === 'passed') return 'text-status-success-text';

  if (status === 'failed') return 'text-status-error-text';

  return 'text-on-surface-variant';

}



const learningBadgeBase =

  'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium max-w-[7rem] truncate sm:max-w-none';



function learningBadgeClass(level?: string) {

  switch (level) {

    case 'excellent':

      return `${learningBadgeBase} bg-status-success-bg text-status-success-text`;

    case 'good':

      return `${learningBadgeBase} bg-status-info-bg text-status-info-text`;

    case 'average':

      return `${learningBadgeBase} bg-status-warning-bg text-status-warning-text`;

    case 'weak':

      return `${learningBadgeBase} bg-error-container text-on-error-container`;

    default:

      return `${learningBadgeBase} bg-status-neutral-bg text-status-neutral-text`;

  }

}



export default function TeacherStudentsPage() {

  const router = useRouter();

  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();

  const [rows, setRows] = useState<StudentRow[]>([]);

  const [advised, setAdvised] = useState<{ id: string; name: string }[]>([]);

  const [groupId, setGroupId] = useState('');



  const loadAdvised = useCallback(async () => {

    try {

      const res = await teacherAPI.listGroups();

      const list = (res.data as { id: string; name: string; iAmAdvisor?: boolean }[])

        .filter((g) => g.iAmAdvisor)

        .map((g) => ({ id: g.id, name: g.name }));

      setAdvised(list);

      setGroupId((prev) => {

        if (prev && list.some((x) => x.id === prev)) return prev;

        return list[0]?.id ?? '';

      });

    } catch {

      setAdvised([]);

      setGroupId('');

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

    void loadAdvised();

  }, [isAuthenticated, user, loadAdvised]);



  useEffect(() => {

    if (!isAuthenticated || user?.role !== 'TEACHER' || !groupId) {

      setRows([]);

      return;

    }

    teacherAPI

      .students(groupId)

      .then((res) => setRows(res.data as StudentRow[]))

      .catch(() => setRows([]));

  }, [isAuthenticated, user, groupId]);



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

          <header className="mb-8">

            <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">学生学情明细</h1>

            <p className="mt-3 max-w-3xl text-sm text-on-surface-variant leading-relaxed">

              查看所选学习小组的学生学情；需先在该小组担任小组老师。

            </p>

            <TeacherGroupFilterButtons groups={advised} value={groupId} onChange={setGroupId} />

          </header>

          {advised.length === 0 && (

            <p className="mb-6 text-sm text-on-surface-variant">

              暂无您担任小组老师的小组，请前往{' '}

              <Link href="/teacher/groups" className="text-primary font-semibold underline-offset-2 hover:underline">

                学习小组

              </Link>{' '}

                担任小组老师。

            </p>

          )}

          <div className={`${profilePageCardClass} overflow-x-auto`}>

            <table className="w-full text-sm min-w-[980px]">

              <thead className="bg-surface-container text-on-surface-variant">

                <tr>

                  <th className="text-left p-4 font-medium">显示名</th>

                  <th className="text-left p-4 font-medium">用户名</th>

                  <th className="text-left p-4 font-medium">学习表现</th>

                  <th className="text-right p-4 font-medium tabular-nums">提交次数</th>

                  <th className="text-right p-4 font-medium tabular-nums">通过次数</th>

                  <th className="text-right p-4 font-medium tabular-nums">通过率</th>

                  <th className="text-right p-4 font-medium tabular-nums">平均得分率</th>

                  <th className="text-left p-4 font-medium">最近提交</th>

                  <th className="text-left p-4 font-medium">注册时间</th>

                </tr>

              </thead>

              <tbody>

                {rows.map((r) => (

                  <tr key={r.id}>

                    <td className="p-4 font-medium text-primary">{r.displayName}</td>

                    <td className="p-4 text-on-surface-variant">@{r.username}</td>

                    <td className="p-4">

                      {r.learningLevel === 'weak' ? (

                        <Link

                          href="/teacher#teacher-attention-panel"

                          className={`${learningBadgeClass('weak')} font-semibold underline-offset-2 hover:underline hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}

                          title="跳转教学工作台 · 重点关注名单"

                        >

                          {r.learningLabel ?? '需加强'}

                        </Link>

                      ) : (

                        <span className={learningBadgeClass(r.learningLevel)}>{r.learningLabel ?? '—'}</span>

                      )}

                    </td>

                    <td className="p-4 text-right tabular-nums text-on-surface">{r.submissionCount ?? 0}</td>

                    <td className="p-4 text-right tabular-nums text-on-surface">{r.passedCount ?? 0}</td>

                    <td className="p-4 text-right tabular-nums text-on-surface">

                      {(r.submissionCount ?? 0) > 0 ? `${r.passRatePercent ?? 0}%` : '—'}

                    </td>

                    <td className="p-4 text-right tabular-nums text-on-surface">

                      {(r.submissionCount ?? 0) > 0 ? `${r.avgScorePercent ?? 0}%` : '—'}

                    </td>

                    <td className="p-4">

                      {r.recentSubmissions?.length ? (

                        <div className="space-y-2">

                          {r.recentSubmissions.slice(0, 3).map((s) => (

                            <Link

                              key={s.id}

                              href={`/submissions/${s.id}`}

                              className="block rounded-md bg-surface-container px-3 py-2 text-xs transition-colors hover:bg-surface-bright"

                            >

                              <span className="block truncate font-medium text-on-surface" title={`${s.courseTitle} · ${s.labTitle}`}>

                                {s.labTitle || s.courseTitle}

                              </span>

                              <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-on-surface-variant">

                                <span className={`shrink-0 font-medium ${submissionStatusClass(s.status)}`}>

                                  {submissionStatusText(s.status)}

                                </span>

                                <span className="min-w-0 truncate tabular-nums">

                                  {s.score}/{s.maxScore} · {formatSubmittedAt(s.submittedAt)}

                                </span>

                              </span>

                            </Link>

                          ))}

                        </div>

                      ) : (

                        <span className="text-on-surface-variant">—</span>

                      )}

                    </td>

                    <td className="p-4 text-on-surface-variant whitespace-nowrap">

                      {formatRegisteredAt(r.createdAt)}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            {rows.length === 0 && advised.length > 0 && (

              <p className="p-8 text-center text-on-surface-variant">该小组暂无学生</p>

            )}

          </div>

        </div>

      </main>

    </div>

  );

}
