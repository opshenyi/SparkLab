'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

export default function ExamDebugPage() {
  const params = useParams();
  const examId = (params?.id ?? '') as string;
  const { user, isAuthenticated, checkAuth } = useAuthStore();
  
  const [examData, setExamData] = useState<any>(null);
  const [questionsData, setQuestionsData] = useState<any>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const testExamAPI = async () => {
    try {
      setExamError(null);
      console.log('Testing exam API:', `/server/labs/${examId}`);
      
      const response = await fetch(`/server/labs/${examId}`, {
        credentials: 'include',
      });
      
      console.log('Exam API Response Status:', response.status);
      console.log('Exam API Response Headers:', Object.fromEntries(response.headers.entries()));
      
      const text = await response.text();
      console.log('Exam API Response Text:', text);
      
      if (response.ok) {
        const data = JSON.parse(text);
        setExamData(data);
      } else {
        setExamError(`HTTP ${response.status}: ${text}`);
      }
    } catch (error) {
      console.error('Exam API Error:', error);
      setExamError(error instanceof Error ? error.message : String(error));
    }
  };

  const testQuestionsAPI = async () => {
    try {
      setQuestionsError(null);
      console.log('Testing questions API:', `/server/labs/${examId}/questions`);
      
      const response = await fetch(`/server/labs/${examId}/questions`, {
        credentials: 'include',
      });
      
      console.log('Questions API Response Status:', response.status);
      console.log('Questions API Response Headers:', Object.fromEntries(response.headers.entries()));
      
      const text = await response.text();
      console.log('Questions API Response Text:', text);
      
      if (response.ok) {
        const data = JSON.parse(text);
        setQuestionsData(data);
      } else {
        setQuestionsError(`HTTP ${response.status}: ${text}`);
      }
    } catch (error) {
      console.error('Questions API Error:', error);
      setQuestionsError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-on-surface">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-on-surface-variant">Exam diagnostics</p>
          <h1 className="text-3xl font-semibold tracking-tight text-page-title">试卷调试</h1>
          <p className="max-w-2xl text-sm text-on-surface-variant">
            用于检查认证状态、试卷接口和题目接口响应。所有输出保持暗色控制台样式。
          </p>
        </header>

        <section className="app-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-page-title">认证信息</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <InfoCell label="认证状态" value={isAuthenticated ? '已认证' : '未认证'} />
            <InfoCell label="试卷 ID" value={examId} mono />
            <InfoCell label="用户" value={user ? user.displayName || user.username : '未登录'} />
          </div>
          {user ? (
            <pre className="mt-4 max-h-72 overflow-auto rounded-lg bg-[var(--terminal-bg)] p-4 font-mono text-xs text-[var(--terminal-text)] shadow-[0_0_0_1px_var(--terminal-border)]">
              {JSON.stringify(user, null, 2)}
            </pre>
          ) : null}
        </section>

        <DiagnosticSection
          title="试卷信息 API"
          endpoint={`/server/labs/${examId}`}
          onTest={testExamAPI}
          error={examError}
          data={examData}
        />

        <DiagnosticSection
          title="题目 API"
          endpoint={`/server/labs/${examId}/questions`}
          onTest={testQuestionsAPI}
          error={questionsError}
          data={questionsData}
          successLabel={Array.isArray(questionsData) ? `成功，${questionsData.length} 道题` : '成功'}
        />
      </div>
    </div>
  );
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-container p-4">
      <p className="mb-1 text-xs text-on-surface-variant">{label}</p>
      <p className={`truncate text-sm font-medium text-on-surface ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function DiagnosticSection({
  title,
  endpoint,
  onTest,
  error,
  data,
  successLabel = '成功',
}: {
  title: string;
  endpoint: string;
  onTest: () => void;
  error: string | null;
  data: unknown;
  successLabel?: string;
}) {
  return (
    <section className="app-card p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-page-title">{title}</h2>
          <p className="mt-1 font-mono text-xs text-on-surface-variant">{endpoint}</p>
        </div>
        <button type="button" onClick={onTest} className="text-button text-button-primary shrink-0">
          测试接口
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error-text">
          <span className="font-medium">错误：</span>
          {error}
        </div>
      ) : null}

      {data ? (
        <div>
          <p className="mb-2 text-sm font-medium text-status-success-text">{successLabel}</p>
          <pre className="max-h-96 overflow-auto rounded-lg bg-[var(--terminal-bg)] p-4 font-mono text-xs text-[var(--terminal-text)] shadow-[0_0_0_1px_var(--terminal-border)]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">等待测试请求。</p>
      )}
    </section>
  );
}
