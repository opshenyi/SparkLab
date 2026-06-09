'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import Sidebar from '@/components/Sidebar';
import TeacherSidebar from '@/components/TeacherSidebar';
import AdminSidebar from '@/components/AdminSidebar';
import LoadingBar from '@/components/LoadingBar';

interface AnswerDetail {
  questionId: string;
  questionTitle: string;
  question?: string;
  questionType: string;
  studentAnswer: any;
  correctAnswer: any;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  explanation?: string;
}

interface Submission {
  id: string;
  userId: string;
  labId: string;
  score: number;
  maxScore: number;
  status: string;
  submittedAt: number;
  student?: {
    id: string;
    username: string;
    displayName: string;
  };
  lab?: {
    id: string;
    title: string;
    type: string;
  };
  course?: {
    id: string;
    title: string;
  };
  answers: AnswerDetail[];
}

export default function ExamResultPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.submissionId as string;
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();
  
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadSubmission();
    }
  }, [isAuthenticated, submissionId]);

  const loadSubmission = async () => {
    try {
      const response = await fetch(`/server/submissions/${submissionId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSubmission(data);
      }
    } catch (error) {
      console.error('Failed to load submission:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAnswer = (answer: any, type: string) => {
    if (type === 'judge') {
      return answer === 'true' ? '正确' : '错误';
    }
    if (Array.isArray(answer)) {
      return answer.join(', ');
    }
    return answer;
  };

  const getStatusColor = (status: string) => {
    if (status === 'passed') return 'text-status-success-text';
    if (status === 'failed') return 'text-error';
    return 'text-on-surface-variant';
  };

  const getStatusText = (status: string) => {
    if (status === 'passed') return '通过';
    if (status === 'failed') return '未通过';
    return '待批改';
  };

  const backHref = user?.role === 'TEACHER'
    ? '/teacher/students'
    : user?.role === 'ADMIN' || user?.role === 'AUTHOR'
      ? '/admin'
      : '/dashboard';

  if (isLoading || loading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated || !submission) {
    return null;
  }

  const percentage = submission.maxScore > 0 ? Math.round((submission.score / submission.maxScore) * 100) : 0;
  const ShellSidebar = user?.role === 'TEACHER'
    ? TeacherSidebar
    : user?.role === 'ADMIN' || user?.role === 'AUTHOR'
      ? AdminSidebar
      : Sidebar;
  const studentAnswerLabel = user?.role === 'STUDENT' ? '你的答案' : '学生答案';

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <ShellSidebar />
      <main className="flex-1 lg:ml-64 p-6 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-6">
            <p className="text-sm font-medium text-on-surface-variant">
              {submission.course?.title || '课程'} · {submission.lab?.title || '提交'}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-page-title">提交详情</h1>
            {submission.student ? (
              <p className="mt-2 text-sm text-on-surface-variant">
                学生 {submission.student.displayName || submission.student.username} · @{submission.student.username}
              </p>
            ) : null}
          </header>

          <div className="app-card p-8 mb-8 text-center">
            <div className={`text-7xl font-bold mb-3 ${getStatusColor(submission.status)}`}>
              {submission.score}
            </div>
            <div className="text-on-surface-variant mb-6">
              总分 {submission.maxScore} 分 · {percentage}% · {getStatusText(submission.status)}
            </div>
            <div className="text-sm text-on-surface-variant">
              {new Date(submission.submittedAt).toLocaleString('zh-CN')}
            </div>
          </div>

          <div className="space-y-3">
            {submission.answers.length === 0 ? (
              <div className="app-card p-6 text-sm text-on-surface-variant">
                该提交没有逐题答题记录。实操实验会先记录提交状态，后续可接入人工评分或自动评测日志。
              </div>
            ) : null}
            {submission.answers.map((answer, index) => (
              <div
                key={answer.questionId}
                className="app-card p-5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-lg font-bold ${
                    answer.isCorrect ? 'text-status-success-text' : 'text-error'
                  }`}>
                    {index + 1}.
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                    {answer.questionType === 'single' ? '单选' :
                     answer.questionType === 'multiple' ? '多选' :
                     answer.questionType === 'judge' ? '判断' :
                     answer.questionType === 'fill' ? '填空' : '简答'}
                  </span>
                  <span className={`text-sm font-medium ml-auto ${answer.isCorrect ? 'text-status-success-text' : 'text-error'}`}>
                    {answer.score}/{answer.maxScore} 分
                  </span>
                </div>

                <div className="space-y-3 pl-7">
                  <div className="text-sm font-medium text-on-surface">{answer.question || answer.questionTitle}</div>
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-on-surface-variant w-20 flex-shrink-0 pt-0.5">{studentAnswerLabel}</span>
                    <span className={`text-sm flex-1 ${answer.isCorrect ? 'text-on-surface' : 'text-error font-medium'}`}>
                      {formatAnswer(answer.studentAnswer, answer.questionType)}
                    </span>
                  </div>

                  {!answer.isCorrect && (
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-on-surface-variant w-20 flex-shrink-0 pt-0.5">正确答案</span>
                      <span className="text-sm text-status-success-text font-medium flex-1">
                        {formatAnswer(answer.correctAnswer, answer.questionType)}
                      </span>
                    </div>
                  )}

                  {answer.explanation && (
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-on-surface-variant w-20 flex-shrink-0 pt-0.5">答案解析</span>
                      <div className="text-sm text-on-surface flex-1 leading-relaxed">
                        {answer.explanation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <button
              onClick={() => router.push(backHref)}
              className="text-primary hover:bg-surface-container px-6 py-2 rounded-lg transition-all"
            >
              返回
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
