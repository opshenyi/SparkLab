'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { teacherAPI } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import LoadingBar from '@/components/LoadingBar';
import TeacherSidebar from '@/components/TeacherSidebar';
import TeacherGroupFilterButtons from '@/components/TeacherGroupFilterButtons';
import { profilePageCardClass, profilePageFontClass, profilePageMainInnerClass } from '@/lib/profileShell';

type GradebookCourse = {
  id: string;
  title: string;
  contentCount: number;
};

type GradebookItem = {
  student: {
    id: string;
    username: string;
    displayName: string;
    createdAt?: number;
  };
  progressPercent: number;
  completedCourses: number;
  enrolledCourses: number;
  courseCount: number;
  submissionCount: number;
  passedCount: number;
  pendingCount: number;
  failedCount: number;
  totalScore: number;
  totalMaxScore: number;
  avgScorePercent: number;
  lastSubmittedAt?: number;
  riskLevel: string;
};

type GradebookSummary = {
  studentCount: number;
  courseCount: number;
  avgProgressPercent: number;
  avgScorePercent: number;
  passedCount: number;
  pendingCount: number;
  failedCount: number;
};

const riskText: Record<string, string> = {
  completed: '已完成',
  pending: '待批改',
  inactive: '未开始',
  risk: '需关注',
  normal: '进行中',
};

function riskClass(level: string) {
  if (level === 'completed') return 'bg-status-success-bg text-status-success-text';
  if (level === 'pending') return 'bg-status-warning-bg text-status-warning-text';
  if (level === 'risk') return 'bg-status-error-bg text-status-error-text';
  if (level === 'inactive') return 'bg-status-neutral-bg text-status-neutral-text';
  return 'bg-status-info-bg text-status-info-text';
}

function formatTime(ts?: number) {
  if (!ts) return '-';
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TeacherGradebookPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [advised, setAdvised] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<GradebookCourse[]>([]);
  const [items, setItems] = useState<GradebookItem[]>([]);
  const [summary, setSummary] = useState<GradebookSummary>({
    studentCount: 0,
    courseCount: 0,
    avgProgressPercent: 0,
    avgScorePercent: 0,
    passedCount: 0,
    pendingCount: 0,
    failedCount: 0,
  });
  const [loadingRows, setLoadingRows] = useState(false);

  const loadAdvised = useCallback(async () => {
    try {
      const res = await teacherAPI.listGroups();
      const list = (res.data as { id: string; name: string; iAmAdvisor?: boolean }[])
        .filter((g) => g.iAmAdvisor)
        .map((g) => ({ id: g.id, name: g.name }));
      setAdvised(list);
      setGroupId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? ''));
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
  }, [isAuthenticated, isLoading, router, user]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'TEACHER') return;
    void loadAdvised();
  }, [isAuthenticated, loadAdvised, user]);

  useEffect(() => {
    setCourseId('');
  }, [groupId]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'TEACHER' || !groupId) {
      setCourses([]);
      setItems([]);
      return;
    }
    setLoadingRows(true);
    teacherAPI
      .gradebook(groupId, courseId)
      .then((res) => {
        setCourses(res.data.courses || []);
        setItems(res.data.items || []);
        setSummary(res.data.summary || summary);
      })
      .catch(() => {
        setCourses([]);
        setItems([]);
      })
      .finally(() => setLoadingRows(false));
  }, [courseId, groupId, isAuthenticated, user]);

  const currentGroupName = useMemo(() => advised.find((g) => g.id === groupId)?.name || '未选择小组', [advised, groupId]);
  const currentCourseName = useMemo(() => courses.find((c) => c.id === courseId)?.title || '全部课程', [courseId, courses]);

  const exportRows = () => {
    const rows = [
      ['学习小组', currentGroupName],
      ['课程范围', currentCourseName],
      [],
      ['学生', '用户名', '课程进度', '完成课程', '提交数', '通过', '待批改', '未通过', '平均得分率', '总分', '最后提交', '状态'],
      ...items.map((item) => [
        item.student.displayName || item.student.username,
        item.student.username,
        `${item.progressPercent}%`,
        `${item.completedCourses}/${item.courseCount}`,
        String(item.submissionCount),
        String(item.passedCount),
        String(item.pendingCount),
        String(item.failedCount),
        `${item.avgScorePercent}%`,
        `${item.totalScore}/${item.totalMaxScore}`,
        formatTime(item.lastSubmittedAt),
        riskText[item.riskLevel] || item.riskLevel,
      ]),
    ];
    downloadCsv(`sparklab-gradebook-${currentGroupName}-${currentCourseName}.csv`, rows);
  };

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
            <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">班级成绩册</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
              按学习小组汇总课程进度、通过情况、待批改数量和得分率，可筛选课程并导出当前表格。
            </p>
            <TeacherGroupFilterButtons groups={advised} value={groupId} onChange={setGroupId} />
          </header>

          {advised.length === 0 ? (
            <p className="mb-6 text-sm text-on-surface-variant">
              暂无您担任小组老师的小组，请先前往{' '}
              <Link href="/teacher/groups" className="font-semibold text-primary underline-offset-2 hover:underline">
                学习小组
              </Link>{' '}
              担任小组老师。
            </p>
          ) : null}

          <section className="mb-5 grid gap-3 sm:grid-cols-5">
            {[
              ['学生', summary.studentCount],
              ['课程', summary.courseCount],
              ['平均进度', `${summary.avgProgressPercent}%`],
              ['平均得分率', `${summary.avgScorePercent}%`],
              ['待批改', summary.pendingCount],
            ].map(([label, value]) => (
              <div key={label} className="app-card p-4">
                <p className="text-xs text-on-surface-variant">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-on-surface">{value}</p>
              </div>
            ))}
          </section>

          <section className={profilePageCardClass}>
            <div className="flex flex-col gap-3 border-b border-outline-variant/40 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-page-title">{currentGroupName}</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {loadingRows ? '正在加载成绩册' : `当前 ${items.length} 名学生 · ${currentCourseName}`}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                  className="min-h-9 rounded-md px-3 py-2 text-xs text-on-surface"
                >
                  <option value="">全部课程</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={exportRows}
                  disabled={items.length === 0}
                  className="min-h-9 rounded-md bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-50"
                >
                  导出 CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="p-4 text-left font-medium">学生</th>
                    <th className="p-4 text-right font-medium tabular-nums">课程进度</th>
                    <th className="p-4 text-right font-medium tabular-nums">完成课程</th>
                    <th className="p-4 text-right font-medium tabular-nums">提交</th>
                    <th className="p-4 text-right font-medium tabular-nums">通过</th>
                    <th className="p-4 text-right font-medium tabular-nums">待批改</th>
                    <th className="p-4 text-right font-medium tabular-nums">未通过</th>
                    <th className="p-4 text-right font-medium tabular-nums">平均得分率</th>
                    <th className="p-4 text-right font-medium tabular-nums">总分</th>
                    <th className="p-4 text-left font-medium">最后提交</th>
                    <th className="p-4 text-left font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.student.id} className="border-t border-outline-variant/30">
                      <td className="p-4">
                        <p className="font-medium text-on-surface">{item.student.displayName || item.student.username}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">@{item.student.username}</p>
                      </td>
                      <td className="p-4 text-right tabular-nums text-on-surface">{item.progressPercent}%</td>
                      <td className="p-4 text-right tabular-nums text-on-surface">
                        {item.completedCourses}/{item.courseCount}
                      </td>
                      <td className="p-4 text-right tabular-nums text-on-surface">{item.submissionCount}</td>
                      <td className="p-4 text-right tabular-nums text-status-success-text">{item.passedCount}</td>
                      <td className="p-4 text-right tabular-nums text-status-warning-text">{item.pendingCount}</td>
                      <td className="p-4 text-right tabular-nums text-status-error-text">{item.failedCount}</td>
                      <td className="p-4 text-right tabular-nums text-on-surface">{item.avgScorePercent}%</td>
                      <td className="p-4 text-right tabular-nums text-on-surface">
                        {item.totalScore}/{item.totalMaxScore}
                      </td>
                      <td className="p-4 whitespace-nowrap text-on-surface-variant">{formatTime(item.lastSubmittedAt)}</td>
                      <td className="p-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${riskClass(item.riskLevel)}`}>
                          {riskText[item.riskLevel] || item.riskLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {items.length === 0 ? (
              <div className="p-10 text-center text-sm text-on-surface-variant">
                {advised.length === 0 ? '暂无负责小组' : '当前筛选下暂无学生成绩'}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
