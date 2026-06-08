'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';

interface AnswerDetail {
  questionId: string;
  questionTitle: string;
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
  score: number;
  maxScore: number;
  status: string;
  submittedAt: number;
  answers: AnswerDetail[];
}

export default function ExamResultPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;
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

  if (isLoading || loading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated || !submission) {
    return null;
  }

  const percentage = Math.round((submission.score / submission.maxScore) * 100);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          {/* 成绩卡片 */}
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

          {/* 答题详情 */}
          <div className="space-y-3">
            {submission.answers.map((answer, index) => (
              <div
                key={answer.questionId}
                className="app-card p-5"
              >
                {/* 题目头部 */}
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

                {/* 答案区域 */}
                <div className="space-y-3 pl-7">
                  {/* 你的答案 */}
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-on-surface-variant w-20 flex-shrink-0 pt-0.5">你的答案</span>
                    <span className={`text-sm flex-1 ${answer.isCorrect ? 'text-on-surface' : 'text-error font-medium'}`}>
                      {formatAnswer(answer.studentAnswer, answer.questionType)}
                    </span>
                  </div>

                  {/* 正确答案 - 只在答错时显示 */}
                  {!answer.isCorrect && (
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-on-surface-variant w-20 flex-shrink-0 pt-0.5">正确答案</span>
                      <span className="text-sm text-status-success-text font-medium flex-1">
                        {formatAnswer(answer.correctAnswer, answer.questionType)}
                      </span>
                    </div>
                  )}

                  {/* 答案解析 */}
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

          {/* 底部按钮 */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-primary hover:bg-surface-container px-6 py-2 rounded-lg transition-all"
            >
              返回课程
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
