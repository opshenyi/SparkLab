'use client';

import { useState, useEffect } from 'react';

interface Question {
  id?: string;
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay';
  title: string;
  content: string;
  options?: string[];
  answer: string | string[];
  explanation?: string;
  points: number;
  order: number;
}

interface ExamEditorInlineProps {
  examId?: string;
  onQuestionsChange?: (questions: Question[]) => void;
}

const questionTypes = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill', label: '填空题' },
  { value: 'essay', label: '简答题' },
];

export default function ExamEditorInline({ examId, onQuestionsChange }: ExamEditorInlineProps) {
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (examId) {
      loadQuestions();
    }
  }, [examId]);

  useEffect(() => {
    if (onQuestionsChange) {
      onQuestionsChange(questions);
    }
  }, [questions]);

  const loadQuestions = async () => {
    try {
      const response = await fetch(`/api/proxy/labs/${examId}/questions`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setQuestions(data);
      }
    } catch (error) {
      console.error('Failed to load questions:', error);
    }
  };

  const addQuestion = (type: Question['type']) => {
    const newQuestion: Question = {
      type,
      title: `题目 ${questions.length + 1}`,
      content: '',
      options: type === 'single' || type === 'multiple' ? ['', '', '', ''] : undefined,
      answer: type === 'multiple' ? [] : '',
      explanation: '',
      points: 10,
      order: questions.length,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const deleteQuestion = (index: number) => {
    if (!confirm('确定要删除这道题目吗？')) return;
    const updated = questions.filter((_, i) => i !== index);
    updated.forEach((q, i) => q.order = i);
    setQuestions(updated);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === questions.length - 1)
    ) {
      return;
    }

    const updated = [...questions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    updated.forEach((q, i) => q.order = i);
    setQuestions(updated);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions];
    if (updated[questionIndex].options) {
      updated[questionIndex].options![optionIndex] = value;
      setQuestions(updated);
    }
  };

  const addOption = (questionIndex: number) => {
    const updated = [...questions];
    if (updated[questionIndex].options) {
      updated[questionIndex].options!.push('');
      setQuestions(updated);
    }
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updated = [...questions];
    if (updated[questionIndex].options && updated[questionIndex].options!.length > 2) {
      updated[questionIndex].options!.splice(optionIndex, 1);
      setQuestions(updated);
    }
  };

  const calculateTotalPoints = () => {
    return questions.reduce((sum, q) => sum + q.points, 0);
  };

  // 暴露questions给父组件
  useEffect(() => {
    (window as any).__examQuestions = questions;
  }, [questions]);

  return (
    <div className="space-y-4">
      {/* 添加题目按钮 */}
      <div className="flex gap-2 flex-wrap">
        {questionTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => addQuestion(type.value as Question['type'])}
            className="bg-surface-container text-primary px-3 py-2 rounded-lg hover:bg-surface-bright transition-all text-sm"
          >
            添加{type.label}
          </button>
        ))}
        <div className="ml-auto text-sm text-on-surface-variant flex items-center gap-4">
          <span>题目数：{questions.length}</span>
          <span>总分：{calculateTotalPoints()}</span>
        </div>
      </div>

      {/* 题目列表 */}
      {questions.length === 0 ? (
        <div className="text-center py-12 bg-surface-container rounded-lg">
          <p className="text-on-surface-variant">暂无题目，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question, index) => {
            return (
              <div key={index} className="bg-surface-container rounded-lg p-4">
                <div className="flex items-start gap-3">
                  {/* 排序按钮 */}
                  <div className="flex flex-col gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => moveQuestion(index, 'up')}
                      disabled={index === 0}
                      className="text-xs text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(index, 'down')}
                      disabled={index === questions.length - 1}
                      className="text-xs text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      下移
                    </button>
                  </div>

                  <div className="flex-1 space-y-3">
                    {/* 题目头部 */}
                    <div className="flex items-center gap-2">
                      <span className="bg-primary/20 text-primary px-2 py-1 rounded text-xs font-medium">
                        {questionTypes.find((t) => t.value === question.type)?.label}
                      </span>
                      <input
                        type="number"
                        value={question.points}
                        onChange={(e) => updateQuestion(index, 'points', parseInt(e.target.value) || 0)}
                        min="1"
                        className="w-16 bg-surface-bright text-on-surface px-2 py-1 rounded text-xs text-center"
                      />
                      <span className="text-xs text-on-surface-variant">分</span>
                      <button
                        type="button"
                        onClick={() => deleteQuestion(index)}
                        className="ml-auto text-error hover:bg-error/10 px-2 py-1 rounded transition-colors text-xs"
                      >
                        删除
                      </button>
                    </div>

                    {/* 题目内容 */}
                    <textarea
                      value={question.content}
                      onChange={(e) => updateQuestion(index, 'content', e.target.value)}
                      placeholder="请输入题目内容..."
                      rows={2}
                      className="w-full bg-surface-bright text-on-surface px-3 py-2 rounded text-sm resize-none"
                    />

                    {/* 选项（单选/多选） */}
                    {(question.type === 'single' || question.type === 'multiple') && (
                      <div className="space-y-2">
                        {question.options?.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-on-surface-variant w-6">
                              {String.fromCharCode(65 + optionIndex)}.
                            </span>
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                              placeholder={`选项 ${String.fromCharCode(65 + optionIndex)}`}
                              className="flex-1 bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                            />
                            {question.options && question.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeOption(index, optionIndex)}
                                className="text-error hover:bg-error/10 px-2 py-1 rounded text-xs"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addOption(index)}
                          className="text-primary hover:bg-primary/10 px-2 py-1 rounded text-xs"
                        >
                          添加选项
                        </button>
                      </div>
                    )}

                    {/* 答案 */}
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">正确答案 *</label>
                      {question.type === 'single' && (
                        <select
                          value={question.answer as string}
                          onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
                          className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                        >
                          <option value="">请选择</option>
                          {question.options?.map((_, optionIndex) => (
                            <option key={optionIndex} value={String.fromCharCode(65 + optionIndex)}>
                              {String.fromCharCode(65 + optionIndex)}
                            </option>
                          ))}
                        </select>
                      )}
                      {question.type === 'multiple' && (
                        <div className="flex flex-wrap gap-2">
                          {question.options?.map((option, optionIndex) => {
                            const optionLetter = String.fromCharCode(65 + optionIndex);
                            const isChecked = Array.isArray(question.answer) && question.answer.includes(optionLetter);
                            return (
                              <label key={optionIndex} className="flex items-center gap-1 cursor-pointer text-sm">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const currentAnswers = Array.isArray(question.answer) ? question.answer : [];
                                    const newAnswers = e.target.checked
                                      ? [...currentAnswers, optionLetter]
                                      : currentAnswers.filter(a => a !== optionLetter);
                                    updateQuestion(index, 'answer', newAnswers);
                                  }}
                                  className="w-3 h-3"
                                />
                                <span>{optionLetter}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {question.type === 'judge' && (
                        <select
                          value={question.answer as string}
                          onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
                          className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm"
                        >
                          <option value="">请选择</option>
                          <option value="true">正确</option>
                          <option value="false">错误</option>
                        </select>
                      )}
                      {(question.type === 'fill' || question.type === 'essay') && (
                        <textarea
                          value={question.answer as string}
                          onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
                          placeholder="请输入参考答案..."
                          rows={2}
                          className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm resize-none"
                        />
                      )}
                    </div>

                    {/* 答案解析 */}
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">答案解析（可选）</label>
                      <textarea
                        value={question.explanation || ''}
                        onChange={(e) => updateQuestion(index, 'explanation', e.target.value)}
                        placeholder="请输入答案解析..."
                        rows={1}
                        className="w-full bg-surface-bright text-on-surface px-2 py-1 rounded text-sm resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
