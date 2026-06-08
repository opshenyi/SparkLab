'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';

interface Question {
  id: string;
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay';
  title: string;
  content: string;
  options?: string[];
  points: number;
  order: number;
}

interface Answer {
  questionId: string;
  answer: string | string[];
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();
  
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      loadExam();
    }
  }, [isAuthenticated, examId]);

  useEffect(() => {
    if (hasStarted && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [hasStarted, timeRemaining]);

  const loadExam = async () => {
    try {
      setLoadError(null);
      
      // 加载试卷信息
      const examRes = await fetch(`/server/labs/${examId}`, {
        credentials: 'include',
      });
      
      if (!examRes.ok) {
        const errorText = await examRes.text();
        console.error('Failed to load exam:', examRes.status, errorText);
        setLoadError(`加载试卷失败: ${examRes.status}`);
        return;
      }
      
      const examData = await examRes.json();

      // 检查是否是试卷类型
      if (examData.type !== 'exam') {
        setLoadError('该实验不是试卷类型');
        return;
      }
      
      setExam(examData);
      setTimeRemaining(examData.timeLimit * 60); // 转换为秒

      // 加载题目
      const questionsRes = await fetch(`/server/labs/${examId}/questions`, {
        credentials: 'include',
      });
      
      if (!questionsRes.ok) {
        const errorText = await questionsRes.text();
        console.error('Failed to load questions:', questionsRes.status, errorText);
        setLoadError(`加载题目失败: ${questionsRes.status}`);
        return;
      }
      
      const questionsData = await questionsRes.json();

      if (!questionsData || questionsData.length === 0) {
        setLoadError('该试卷暂无题目，请联系老师添加题目后再进行考试');
        return;
      }
      
      setQuestions(questionsData);
    } catch (error) {
      console.error('Failed to load exam:', error);
      setLoadError(`加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleStart = () => {
    setHasStarted(true);
  };

  const handleAnswerChange = (questionId: string, answer: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleSubmit = async () => {
    if (!confirm('确定要提交试卷吗？提交后将无法修改！')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const answersArray = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));

      const response = await fetch(`/server/labs/${examId}/submit-exam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ answers: answersArray }),
      });

      if (response.ok) {
        const result = await response.json();
        router.push(`/exam/${examId}/result/${result.submissionId}`);
      } else {
        alert('提交失败，请重试');
      }
    } catch (error) {
      console.error('Failed to submit exam:', error);
      alert('提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getAnsweredCount = () => {
    return Object.keys(answers).filter(qId => {
      const answer = answers[qId];
      if (Array.isArray(answer)) {
        return answer.length > 0;
      }
      return answer !== '' && answer !== null && answer !== undefined;
    }).length;
  };

  const renderQuestion = (question: Question) => {
    const answer = answers[question.id];

    return (
      <div className="app-card p-6">
        {/* 题目头部 */}
        <div className="flex items-center gap-3 mb-5 pb-4">
          <span className="text-2xl font-bold text-primary">
            {currentQuestionIndex + 1}
          </span>
          <span className="text-sm px-2.5 py-1 rounded-md bg-primary/10 text-primary">
            {question.type === 'single' ? '单选' :
             question.type === 'multiple' ? '多选' :
             question.type === 'judge' ? '判断' :
             question.type === 'fill' ? '填空' : '简答'}
          </span>
          <span className="text-sm text-on-surface-variant ml-auto">
            {question.points} 分
          </span>
        </div>

        {/* 题目内容 */}
        <div className="mb-6">
          <p className="text-base text-on-surface leading-relaxed whitespace-pre-wrap">
            {question.content}
          </p>
        </div>

        {/* 答题区域 */}
        <div>
          {/* 单选题 */}
          {question.type === 'single' && question.options && (
            <div className="space-y-2.5">
              {question.options.map((option, index) => {
                const optionLetter = String.fromCharCode(65 + index);
                return (
                  <label
                    key={index}
                    className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-all ${
                      answer === optionLetter
                        ? 'bg-primary/10'
                        : 'bg-surface-container hover:bg-surface-bright'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={optionLetter}
                      checked={answer === optionLetter}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                      className="mt-0.5 w-4 h-4 flex-shrink-0"
                    />
                    <span className="flex-1 text-on-surface">
                      <span className="font-medium mr-2">{optionLetter}.</span>
                      {option}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* 多选题 */}
          {question.type === 'multiple' && question.options && (
            <div className="space-y-2.5">
              {question.options.map((option, index) => {
                const optionLetter = String.fromCharCode(65 + index);
                const isChecked = Array.isArray(answer) && answer.includes(optionLetter);
                return (
                  <label
                    key={index}
                    className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-primary/10'
                        : 'bg-surface-container hover:bg-surface-bright'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const currentAnswers = Array.isArray(answer) ? answer : [];
                        const newAnswers = e.target.checked
                          ? [...currentAnswers, optionLetter]
                          : currentAnswers.filter(a => a !== optionLetter);
                        handleAnswerChange(question.id, newAnswers);
                      }}
                      className="mt-0.5 w-4 h-4 flex-shrink-0"
                    />
                    <span className="flex-1 text-on-surface">
                      <span className="font-medium mr-2">{optionLetter}.</span>
                      {option}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* 判断题 */}
          {question.type === 'judge' && (
            <div className="flex gap-3">
              <label
                className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg cursor-pointer transition-all ${
                  answer === 'true'
                    ? 'bg-primary/10'
                    : 'bg-surface-container hover:bg-surface-bright'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value="true"
                  checked={answer === 'true'}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  className="w-4 h-4"
                />
                <span className="font-medium">正确</span>
              </label>
              <label
                className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg cursor-pointer transition-all ${
                  answer === 'false'
                    ? 'bg-primary/10'
                    : 'bg-surface-container hover:bg-surface-bright'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value="false"
                  checked={answer === 'false'}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  className="w-4 h-4"
                />
                <span className="font-medium">错误</span>
              </label>
            </div>
          )}

          {/* 填空题 */}
          {question.type === 'fill' && (
            <input
              type="text"
              value={answer || ''}
              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
              placeholder="请输入答案"
              className="w-full bg-surface-container text-on-surface px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}

          {/* 简答题 */}
          {question.type === 'essay' && (
            <textarea
              value={answer || ''}
              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
              placeholder="请输入答案"
              rows={6}
              className="w-full bg-surface-container text-on-surface px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          )}
        </div>

        {/* 底部导航 */}
        <div className="flex justify-between mt-6 pt-4">
          <button
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed text-primary hover:bg-surface-container"
          >
            上一题
          </button>
          <button
            onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
            disabled={currentQuestionIndex === questions.length - 1}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed text-primary hover:bg-surface-container"
          >
            下一题
          </button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8">
          <div className="max-w-2xl mx-auto">
            <div className="app-card p-8 text-center">
              <h2 className="text-2xl font-bold text-error mb-2">加载失败</h2>
              <p className="text-on-surface-variant mb-6">{loadError}</p>
              <button
                onClick={() => {
                  setLoadError(null);
                  loadExam();
                }}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg hover:opacity-90 transition-all"
              >
                重试
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8">
          <LoadingBar text="加载试卷中..." />
        </main>
      </div>
    );
  }

  // 开始前的说明页面
  if (!hasStarted) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8">
          <div className="max-w-3xl mx-auto">
            <div className="app-card p-8 text-center">
              <h1 className="text-page-title text-3xl font-bold mb-4">{exam.title}</h1>
              <p className="text-on-surface-variant mb-8">{exam.description}</p>
              
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-surface-container rounded-lg p-4">
                  <div className="text-sm text-on-surface-variant mb-1">题目数量</div>
                  <div className="text-2xl font-bold text-primary">{questions.length}</div>
                </div>
                <div className="bg-surface-container rounded-lg p-4">
                  <div className="text-sm text-on-surface-variant mb-1">考试时长</div>
                  <div className="text-2xl font-bold text-primary">{exam.timeLimit} 分钟</div>
                </div>
                <div className="bg-surface-container rounded-lg p-4">
                  <div className="text-sm text-on-surface-variant mb-1">总分</div>
                  <div className="text-2xl font-bold text-primary">{exam.points} 分</div>
                </div>
              </div>

              <div className="bg-surface-container rounded-lg p-6 mb-8 text-left">
                <h3 className="text-page-title font-bold mb-3 flex items-center gap-2">
                  考试须知
                </h3>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>考试开始后，计时器将自动开始倒计时</li>
                  <li>请在规定时间内完成所有题目</li>
                  <li>时间到后将自动提交试卷</li>
                  <li>提交后无法修改答案，请仔细检查</li>
                  <li>请保持网络连接稳定</li>
                </ul>
              </div>

              <button
                onClick={handleStart}
                className="bg-primary text-on-primary px-8 py-3 rounded-lg text-lg font-medium hover:opacity-90 transition-all"
              >
                开始考试
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64">
        {/* 顶部状态栏 */}
        <div className="sticky top-0 z-10 bg-surface-lowest border-b border-outline-variant/50 shadow-sm">
          <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-page-title text-xl font-bold">{exam.title}</h2>
              <p className="text-sm text-on-surface-variant">
                已答 {getAnsweredCount()} / {questions.length} 题
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className={`flex items-center gap-2 ${timeRemaining < 300 ? 'text-error' : 'text-on-surface'}`}>
                <span className="text-lg font-mono font-bold">{formatTime(timeRemaining)}</span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? '提交中...' : '提交试卷'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-8 px-8 py-6 max-w-[1400px] mx-auto">
          {/* 左侧：题目内容 */}
          <div className="flex-1 min-w-0">
            {renderQuestion(currentQuestion)}
          </div>

          {/* 右侧：答题卡 */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-nav-blue-vein rounded-lg p-5 sticky top-24">
              {/* 答题进度 */}
              <div className="mb-5">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm text-on-surface-variant">答题进度</span>
                  <span className="text-lg font-bold text-primary">{getAnsweredCount()}/{questions.length}</span>
                </div>
                <div className="w-full bg-surface-container rounded-full h-1.5">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${(getAnsweredCount() / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* 题号网格 */}
              <div className="grid grid-cols-6 gap-2">
                {questions.map((q, index) => {
                  const hasAnswer = answers[q.id] !== undefined && answers[q.id] !== '' && 
                    (!Array.isArray(answers[q.id]) || answers[q.id].length > 0);
                  const isCurrent = index === currentQuestionIndex;
                  
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(index)}
                      aria-label={`第 ${index + 1} 题`}
                      className={`aspect-square rounded-md font-medium transition-all text-sm ${
                        isCurrent
                          ? 'bg-primary text-on-primary'
                          : hasAnswer
                          ? 'bg-primary/15 text-primary'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
                      }`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
