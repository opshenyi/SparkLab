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

type SubmissionStatus = 'all' | 'pending' | 'passed' | 'failed';

type TeacherSubmission = {
  id: string;
  score: number;
  maxScore: number;
  status: string;
  submittedAt: number;
  answerCount: number;
  student: { id: string; username: string; displayName: string };
  lab: { id: string; title: string; type: string };
  course: { id: string; title: string };
};

type SubmissionSummary = {
  total: number;
  pending: number;
  passed: number;
  failed: number;
};

const statusTabs: { value: SubmissionStatus; label: string }[] = [
  { value: 'pending', label: '待批改' },
  { value: 'all', label: '全部' },
  { value: 'passed', label: '已通过' },
  { value: 'failed', label: '未通过' },
];

function statusText(status: string) {
  if (status === 'pending') return '待批改';
  if (status === 'passed') return '已通过';
  if (status === 'failed') return '未通过';
  return status || '未知';
}

function statusClass(status: string) {
  if (status === 'pending') return 'bg-status-warning-bg text-status-warning-text';
  if (status === 'passed') return 'bg-status-success-bg text-status-success-text';
  if (status === 'failed') return 'bg-status-error-bg text-status-error-text';
  return 'bg-status-neutral-bg text-status-neutral-text';
}

function formatSubmittedAt(ts?: number) {
  if (!ts) return '-';
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [advised, setAdvised] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<SubmissionStatus>('pending');
  const [items, setItems] = useState<TeacherSubmission[]>([]);
  const [summary, setSummary] = useState<SubmissionSummary>({ total: 0, pending: 0, passed: 0, failed: 0 });
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
    if (!isAuthenticated || user?.role !== 'TEACHER' || !groupId) {
      setItems([]);
      setSummary({ total: 0, pending: 0, passed: 0, failed: 0 });
      return;
    }
    setLoadingRows(true);
    teacherAPI
      .submissions(groupId, status)
      .then((res) => {
        setItems(res.data.items || []);
        setSummary(res.data.summary || { total: 0, pending: 0, passed: 0, failed: 0 });
      })
      .catch(() => {
        setItems([]);
        setSummary({ total: 0, pending: 0, passed: 0, failed: 0 });
      })
      .finally(() => setLoadingRows(false));
  }, [groupId, isAuthenticated, status, user]);

  const currentGroupName = useMemo(() => advised.find((g) => g.id === groupId)?.name || '未选择小组', [advised, groupId]);

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
            <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">提交批改队列</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
              集中处理当前学习小组的待批改试卷、简答题和实操提交，评分后学生会在提交详情中看到结果与反馈。
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

          <section className="mb-5 grid gap-3 sm:grid-cols-4">
            {[
              ['待批改', summary.pending],
              ['全部提交', summary.total],
              ['已通过', summary.passed],
              ['未通过', summary.failed],
            ].map(([label, value]) => (
              <div key={label} className="app-card p-4">
                <p className="text-xs text-on-surface-variant">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-on-surface">{value}</p>
              </div>
            ))}
          </section>

          <section className={profilePageCardClass}>
            <div className="flex flex-col gap-3 border-b border-outline-variant/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-page-title">{currentGroupName}</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {loadingRows ? '正在加载提交' : `当前列表 ${items.length} 条`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {statusTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatus(tab.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      status === tab.value
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright hover:text-on-surface'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="p-4 text-left font-medium">学生</th>
                    <th className="p-4 text-left font-medium">内容</th>
                    <th className="p-4 text-left font-medium">状态</th>
                    <th className="p-4 text-right font-medium tabular-nums">得分</th>
                    <th className="p-4 text-right font-medium tabular-nums">答题数</th>
                    <th className="p-4 text-left font-medium">提交时间</th>
                    <th className="p-4 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-outline-variant/30">
                      <td className="p-4">
                        <p className="font-medium text-on-surface">{item.student.displayName || item.student.username}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">@{item.student.username}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-on-surface">{item.lab.title}</p>
                        <p className="mt-1 max-w-xs truncate text-xs text-on-surface-variant">{item.course.title}</p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                          {statusText(item.status)}
                        </span>
                      </td>
                      <td className="p-4 text-right tabular-nums text-on-surface">
                        {item.score}/{item.maxScore}
                      </td>
                      <td className="p-4 text-right tabular-nums text-on-surface">{item.answerCount}</td>
                      <td className="p-4 whitespace-nowrap text-on-surface-variant">{formatSubmittedAt(item.submittedAt)}</td>
                      <td className="p-4 text-right">
                        <Link href={`/submissions/${item.id}`} className="font-medium text-primary hover:underline">
                          查看批改
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {items.length === 0 ? (
              <div className="p-10 text-center text-sm text-on-surface-variant">
                {advised.length === 0 ? '暂无负责小组' : status === 'pending' ? '当前没有待批改提交' : '当前筛选下没有提交'}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

