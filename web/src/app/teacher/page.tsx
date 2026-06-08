'use client';



import { useEffect, useMemo, useState, useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/store/useAuthStore';

import { teacherAPI } from '@/lib/api';

import TeacherSidebar from '@/components/TeacherSidebar';

import LoadingBar from '@/components/LoadingBar';

import Link from 'next/link';

import TeacherGroupFilterButtons from '@/components/TeacherGroupFilterButtons';

import { profilePageCardClass, profilePageFontClass, profilePageMainInnerClass } from '@/lib/profileShell';



type Overview = {

  group?: { id: string; name: string };

  class?: { id: string; name: string };

  studentCount: number;

  courseCount: number;

  activeCourseCount?: number;

  labCount?: number;

  materialCount?: number;

  submissionCount?: number;

  runningContainers?: number;

};



type StudentRow = {

  id: string;

  displayName: string;

  username: string;

  learningLabel?: string;

  learningLevel?: string;

  submissionCount?: number;

  passedCount?: number;

  passRatePercent?: number;

  avgScorePercent?: number;

};



const LEVEL_ORDER = ['excellent', 'good', 'average', 'weak', 'none'] as const;

type LevelKey = (typeof LEVEL_ORDER)[number];



const LEVEL_DIAGNOSIS_ROW = 'bg-surface-lowest/70 dark:bg-surface-low/40';

const LEVEL_DIAGNOSIS_BAR = 'bg-on-surface/28 dark:bg-on-surface/42';



const LEVEL_META: Record<

  LevelKey,

  { label: string; barClass: string; rowClass: string }

> = {

  excellent: { label: '优秀', barClass: LEVEL_DIAGNOSIS_BAR, rowClass: LEVEL_DIAGNOSIS_ROW },

  good: { label: '良好', barClass: LEVEL_DIAGNOSIS_BAR, rowClass: LEVEL_DIAGNOSIS_ROW },

  average: { label: '一般', barClass: LEVEL_DIAGNOSIS_BAR, rowClass: LEVEL_DIAGNOSIS_ROW },

  weak: { label: '需加强', barClass: LEVEL_DIAGNOSIS_BAR, rowClass: LEVEL_DIAGNOSIS_ROW },

  none: { label: '暂无提交', barClass: LEVEL_DIAGNOSIS_BAR, rowClass: LEVEL_DIAGNOSIS_ROW },

};



function normalizeLevel(level?: string): LevelKey {

  if (level === 'excellent' || level === 'good' || level === 'average' || level === 'weak') return level;

  return 'none';

}



function badgeClass(level?: string) {

  switch (level) {

    case 'excellent':

      return 'bg-status-success-bg text-status-success-text';

    case 'good':

      return 'bg-status-info-bg text-status-info-text';

    case 'average':

      return 'bg-status-warning-bg text-status-warning-text';

    case 'weak':

      return 'bg-error-container text-on-error-container';

    default:

      return 'bg-status-neutral-bg text-status-neutral-text';

  }

}



export default function TeacherHomePage() {

  const router = useRouter();

  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();

  const [advised, setAdvised] = useState<{ id: string; name: string }[]>([]);

  const [groupId, setGroupId] = useState('');

  const [overview, setOverview] = useState<Overview | null>(null);

  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);

  const [loadError, setLoadError] = useState('');



  const loadAdvised = useCallback(async () => {

    try {

      const res = await teacherAPI.listGroups();

      const rows = (res.data as { id: string; name: string; iAmAdvisor?: boolean }[]).filter((g) => g.iAmAdvisor);

      const list = rows.map((g) => ({ id: g.id, name: g.name }));

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

      setOverview(null);

      setAllStudents([]);

      setLoadError('');

      return;

    }

    setLoadError('');

    teacherAPI

      .overview(groupId)

      .then((res) => setOverview(res.data as Overview))

      .catch((e) => {

        setOverview(null);

        setLoadError(e.response?.data?.message || e.message || '工作台数据加载失败');

      });



    teacherAPI

      .students(groupId)

      .then((res) => setAllStudents(res.data as StudentRow[]))

      .catch(() => setAllStudents([]));

  }, [isAuthenticated, user, groupId]);



  const studentCount = allStudents.length || overview?.studentCount || 0;

  const submissionTotal = overview?.submissionCount ?? 0;

  const labTotal = overview?.labCount ?? 0;



  const { levelCounts, activeSubmitters, avgSubPerStudent, engagementRatio, needAttention, workloadIndex } =

    useMemo(() => {

      const counts: Record<LevelKey, number> = {

        excellent: 0,

        good: 0,

        average: 0,

        weak: 0,

        none: 0,

      };

      let active = 0;

      for (const s of allStudents) {

        counts[normalizeLevel(s.learningLevel)]++;

        if ((s.submissionCount ?? 0) > 0) active++;

      }

      const n = allStudents.length;

      const avgSub = n > 0 ? Math.round((submissionTotal / n) * 10) / 10 : 0;

      const engage = n > 0 ? Math.round((active / n) * 100) : 0;

      const denom = n * Math.max(labTotal, 1);

      const workload = denom > 0 ? Math.min(100, Math.round((submissionTotal / denom) * 100)) : 0;



      const scored = [...allStudents].sort((a, b) => {

        const pri = (x: StudentRow) => {

          const lv = normalizeLevel(x.learningLevel);

          if (lv === 'weak') return 0;

          if (lv === 'none' && (x.submissionCount ?? 0) === 0) return 1;

          if (lv === 'average') return 2;

          return 3;

        };

        return pri(a) - pri(b) || (a.submissionCount ?? 0) - (b.submissionCount ?? 0);

      });

      const attention = scored.filter((s) => {

        const lv = normalizeLevel(s.learningLevel);

        return lv === 'weak' || lv === 'none' || lv === 'average';

      }).slice(0, 6);



      return {

        levelCounts: counts,

        activeSubmitters: active,

        avgSubPerStudent: avgSub,

        engagementRatio: engage,

        needAttention: attention,

        workloadIndex: workload,

      };

    }, [allStudents, submissionTotal, labTotal]);



  const secondaryStats = overview

    ? [

        { label: '课程', value: overview.courseCount, suffix: '门' },

        { label: '课时', value: overview.labCount ?? 0, suffix: '节' },

        { label: '课件', value: overview.materialCount ?? 0, suffix: '份' },

        { label: '运行中容器', value: overview.runningContainers ?? 0, suffix: '台' },

      ]

    : [];



  if (isLoading) {

    return <LoadingBar />;

  }

  if (isLoggingOut) {

    return <LoadingBar text="退出中" />;

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

            <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">学情分析大屏</h1>

            <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant">

              <span className="text-on-surface font-medium">

                {user?.displayName ? `${user.displayName}老师` : '老师'}您好。

              </span>{' '}

              请选择要查看的学习小组；担任小组老师后可查看该组学情。

            </p>

            <TeacherGroupFilterButtons groups={advised} value={groupId} onChange={setGroupId} />

          </header>



          {advised.length === 0 && (

            <div className={`mb-8 ${profilePageCardClass} p-5 bg-primary/5 dark:bg-primary/10`} role="status">

              <p className="font-medium text-on-surface">您尚未担任任何学习小组的小组老师</p>

              <p className="text-sm mt-2 text-on-surface-variant leading-relaxed">

                请前往{' '}

                <Link href="/teacher/groups" className="text-primary font-semibold underline-offset-2 hover:underline">

                  学习小组

                </Link>{' '}

                创建小组或担任小组老师，即可在此查看学情与管理课程。

              </p>

            </div>

          )}



          {loadError && advised.length > 0 && (

            <div

              className={`mb-8 ${profilePageCardClass} p-5 bg-amber-500/[0.07] dark:bg-amber-500/10`}

              role="alert"

            >

              <p className="font-medium text-amber-800 dark:text-amber-200">{loadError}</p>

            </div>

          )}



          {overview && advised.length > 0 && (

            <>

              <section aria-label="运行指标" className="mb-6">

                <h2 className="mb-3 text-base font-semibold text-on-surface">运行指标</h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">

                  <div className={`${profilePageCardClass} p-5 sm:p-6`}>

                    <p className="text-xs font-medium text-on-surface-variant">在组学生</p>

                    <p className="mt-2 text-3xl sm:text-4xl font-bold tabular-nums text-page-title leading-none">

                      {studentCount}

                      <span className="text-lg font-semibold text-on-surface-variant ml-1">人</span>

                    </p>

                  </div>

                  <div className={`${profilePageCardClass} p-5 sm:p-6`}>

                    <p className="text-xs font-medium text-on-surface-variant">本组累计实验提交</p>

                    <p className="mt-2 text-3xl sm:text-4xl font-bold tabular-nums text-page-title leading-none">

                      {submissionTotal}

                      <span className="text-lg font-semibold text-on-surface-variant ml-1">次</span>

                    </p>

                  </div>

                  <div className={`${profilePageCardClass} p-5 sm:p-6`}>

                    <p className="text-xs font-medium text-on-surface-variant">人均实验提交</p>

                    <p className="mt-2 text-3xl sm:text-4xl font-bold tabular-nums text-page-title leading-none">

                      {studentCount > 0 ? avgSubPerStudent : '—'}

                      {studentCount > 0 ? (

                        <span className="text-lg font-semibold text-on-surface-variant ml-1">次/人</span>

                      ) : null}

                    </p>

                  </div>

                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">

                  {secondaryStats.map((s) => (

                    <div key={s.label} className={`${profilePageCardClass} p-4`}>

                      <span className="text-[11px] font-medium text-on-surface-variant">{s.label}</span>

                      <div className="mt-1.5 flex items-baseline gap-0.5">

                        <span className="text-xl font-bold tabular-nums text-page-title">{s.value}</span>

                        <span className="text-sm text-on-surface-variant">{s.suffix}</span>

                      </div>

                    </div>

                  ))}

                </div>

              </section>



              <section aria-label="学情追踪" className="mb-10 space-y-5">

                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">

                  <h2 className="text-base font-semibold text-on-surface">学情追踪</h2>

                </div>



                <div className={`${profilePageCardClass} p-6 sm:p-8`}>

                  <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">

                    <div className="rounded-xl bg-surface-container/35 dark:bg-surface-container/20 p-5 sm:p-6 min-w-0">

                      <p className="text-sm font-semibold text-on-surface">学习参与度</p>

                      <p className="mt-1.5 text-xs text-on-surface-variant leading-relaxed">

                        本组参与实验与过程性考核的覆盖情况

                      </p>

                      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">

                        <div className="rounded-lg bg-surface-lowest/80 dark:bg-surface-low/50 px-4 py-4 sm:px-5 sm:py-5">

                          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">参与学生</p>

                          <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums text-page-title leading-tight">

                            {activeSubmitters}

                            <span className="text-on-surface-variant font-semibold text-xl sm:text-2xl">

                              {' '}

                              / {studentCount || '—'}

                            </span>

                          </p>

                          {studentCount > 0 ? (

                            <p className="text-sm sm:text-base text-on-surface-variant mt-2 tabular-nums">

                              覆盖率 {engagementRatio}%

                            </p>

                          ) : null}

                        </div>

                        <div className="rounded-lg bg-surface-lowest/80 dark:bg-surface-low/50 px-4 py-4 sm:px-5 sm:py-5">

                          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">负荷指数</p>

                          <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums text-page-title leading-tight">

                            {studentCount > 0 && labTotal > 0 ? `${workloadIndex}%` : '—'}

                          </p>

                          <p className="text-xs sm:text-sm text-on-surface-variant mt-2 leading-snug">

                            相对课时量的提交强度

                          </p>

                        </div>

                      </div>

                    </div>



                    <div className="rounded-xl bg-surface-container/35 dark:bg-surface-container/20 p-5 sm:p-6 min-w-0">

                      <p className="text-sm font-semibold text-on-surface">学习效果诊断</p>

                      <p className="mt-1.5 text-xs text-on-surface-variant leading-relaxed">

                        按学情分层统计人数占比，便于识别整体水平结构。

                      </p>

                      <ul className="mt-5 space-y-3">

                        {LEVEL_ORDER.map((key) => {

                          const n = levelCounts[key];

                          const pct = studentCount > 0 ? Math.round((n / studentCount) * 100) : 0;

                          return (

                            <li

                              key={key}

                              className={`grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-2.5 items-center text-xs rounded-lg px-2 py-2.5 -mx-0.5 ${LEVEL_META[key].rowClass}`}

                            >

                              <span className="shrink-0 font-medium text-on-surface-variant">

                                {LEVEL_META[key].label}

                              </span>

                              <div className="h-2 rounded-full bg-surface-container overflow-hidden min-w-0">

                                <div

                                  className={`h-full rounded-full ${LEVEL_META[key].barClass}`}

                                  style={{ width: studentCount > 0 ? `${pct}%` : '0%' }}

                                />

                              </div>

                              <span className="tabular-nums text-on-surface text-right shrink-0 whitespace-nowrap">

                                {studentCount > 0 ? `${n} 人 · ${pct}%` : `${n} 人`}

                              </span>

                            </li>

                          );

                        })}

                      </ul>

                    </div>

                  </div>

                </div>



                <div

                  id="teacher-attention-panel"

                  className={`${profilePageCardClass} p-6 sm:p-8 scroll-mt-20 lg:scroll-mt-8`}

                >

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">

                    <div className="min-w-0 space-y-1">

                      <h3 className="text-base font-semibold text-on-surface">重点关注名单</h3>

                      <p className="text-xs text-on-surface-variant leading-relaxed max-w-2xl">

                        依据学情分层与提交情况自动筛出的优先跟进对象，至多 6 人；完整名单见「学生学情明细」。

                      </p>

                    </div>

                    <Link

                      href="/teacher/students"

                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"

                    >

                      学生学情明细

                    </Link>

                  </div>

                  {needAttention.length === 0 ? (

                    <div

                      className="mt-6 rounded-xl bg-surface-container/30 dark:bg-surface-container/15 px-4 py-12 text-center text-sm text-on-surface-variant"

                      role="status"

                    >

                      {studentCount === 0 ? '暂无在组学员' : '当前暂无需要优先跟进的学员'}

                    </div>

                  ) : (

                    <ul className="mt-6 grid gap-3 sm:grid-cols-2">

                      {needAttention.map((s) => {

                        const initial = (s.displayName || s.username || '?').charAt(0).toUpperCase();

                        return (

                          <li

                            key={s.id}

                            className="flex items-center gap-3 rounded-xl bg-surface-container/40 dark:bg-surface-container/15 px-4 py-3.5 min-w-0"

                          >

                            <div

                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary"

                              aria-hidden

                            >

                              {initial}

                            </div>

                            <div className="min-w-0 flex-1">

                              <p className="font-medium text-page-title truncate">{s.displayName}</p>

                              <p className="text-[11px] text-on-surface-variant truncate tabular-nums mt-0.5">

                                @{s.username}

                                {typeof s.submissionCount === 'number' ? ` · 提交 ${s.submissionCount} 次` : ''}

                              </p>

                            </div>

                            <span

                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium max-w-[7rem] truncate sm:max-w-none ${badgeClass(s.learningLevel)}`}

                              title={s.learningLabel ?? '暂无提交'}

                            >

                              {s.learningLabel ?? '暂无提交'}

                            </span>

                          </li>

                        );

                      })}

                    </ul>

                  )}

                </div>

              </section>

            </>

          )}

        </div>

      </main>

    </div>

  );

}

