'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

export default function ExamDebugPage() {
  const params = useParams();
  const examId = params.id as string;
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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">试卷调试页面</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">认证信息</h2>
          <div className="space-y-2">
            <p><strong>已认证:</strong> {isAuthenticated ? '是' : '否'}</p>
            <p><strong>用户:</strong> {user ? JSON.stringify(user, null, 2) : '未登录'}</p>
            <p><strong>试卷ID:</strong> {examId}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">试卷信息 API 测试</h2>
          <button
            onClick={testExamAPI}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4"
          >
            测试 /server/labs/{examId}
          </button>
          
          {examError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              <strong>错误:</strong> {examError}
            </div>
          )}
          
          {examData && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              <strong>成功:</strong>
              <pre className="mt-2 text-sm overflow-auto">{JSON.stringify(examData, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">题目 API 测试</h2>
          <button
            onClick={testQuestionsAPI}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4"
          >
            测试 /server/labs/{examId}/questions
          </button>
          
          {questionsError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              <strong>错误:</strong> {questionsError}
            </div>
          )}
          
          {questionsData && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              <strong>成功 ({questionsData.length} 道题目):</strong>
              <pre className="mt-2 text-sm overflow-auto">{JSON.stringify(questionsData, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
