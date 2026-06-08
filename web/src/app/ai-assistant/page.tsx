'use client';

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import Sidebar from '@/components/Sidebar';
import TeacherSidebar from '@/components/TeacherSidebar';
import LoadingBar from '@/components/LoadingBar';
import {
  Plus,
  Copy,
  Share2,
  ThumbsUp,
  ThumbsDown,
  ArrowUp,
  MessagesSquare,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

const STORAGE_VERSION = 1;

const quickActions = [
  { label: 'PPT 生成', prompt: '帮我生成一个关于课程学习的PPT大纲' },
  { label: '图像生成', prompt: '生成一个学习场景的图片' },
  { label: '帮我写作', prompt: '帮我写一篇学习心得' },
  { label: '翻译', prompt: '帮我翻译这段文字' },
  { label: '编程', prompt: '帮我写一段Python代码' },
];

const suggestions = [
  'Linux 基础命令有哪些？',
  'Docker 容器和虚拟机的区别',
  '如何开始学习大数据技术？',
  '帮我解释 Kubernetes 的核心概念',
  'Python 数据分析入门指南',
  '机器学习和深度学习的区别',
  'Git 版本控制常用操作',
  '如何调试 Docker 容器问题？',
  'Spark 和 Hadoop 的应用场景',
];

function createEmptySession(): ChatSession {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: '新对话',
    messages: [],
    updatedAt: Date.now(),
  };
}

function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '新对话';
  const t = firstUser.content.trim().replace(/\s+/g, ' ');
  if (!t) return '新对话';
  return t.length > 28 ? `${t.slice(0, 28)}…` : t;
}

function sessionsStorageKey(userId: string) {
  return `spark-ai-sessions-${userId}`;
}

function loadSessions(userId: string): { sessions: ChatSession[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(sessionsStorageKey(userId));
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      v: number;
      sessions: ChatSession[];
      activeId: string;
    };
    if (data.v !== STORAGE_VERSION || !Array.isArray(data.sessions)) return null;
    return { sessions: data.sessions, activeId: data.activeId };
  } catch {
    return null;
  }
}

function saveSessions(userId: string, sessions: ChatSession[], activeId: string) {
  try {
    localStorage.setItem(
      sessionsStorageKey(userId),
      JSON.stringify({ v: STORAGE_VERSION, sessions, activeId }),
    );
  } catch {
    /* ignore */
  }
}

function AIAssistantPageInner({ embed }: { embed: boolean }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionPopoverRef = useRef<HTMLDivElement>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const userId = user?.id ?? 'local';

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    const loaded = loadSessions(userId);
    if (loaded && loaded.sessions.length > 0) {
      const exists = loaded.sessions.some((s) => s.id === loaded.activeId);
      setSessions(loaded.sessions);
      setActiveSessionId(exists ? loaded.activeId : loaded.sessions[0].id);
    } else {
      const s = createEmptySession();
      setSessions([s]);
      setActiveSessionId(s.id);
    }
    setHydrated(true);
  }, [isAuthenticated, isLoading, userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveSessions(userId, sessions, activeSessionId);
  }, [hydrated, userId, sessions, activeSessionId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId],
  );
  const messages = activeSession?.messages ?? [];

  const clearStream = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsTyping(false);
    setIsThinking(false);
    setStreamingContent('');
  }, []);

  useEffect(() => {
    clearStream();
  }, [activeSessionId, clearStream]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionPopoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSessionPopoverOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sessionPopoverOpen]);

  useEffect(() => {
    if (!sessionPopoverOpen) return;
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const el = sessionPopoverRef.current;
      if (el && !el.contains(e.target as Node)) {
        setSessionPopoverOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [sessionPopoverOpen]);

  const patchActiveSession = useCallback((updater: (prev: ChatSession) => ChatSession) => {
    const id = activeSessionIdRef.current;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = updater(s);
        return {
          ...next,
          title: deriveTitle(next.messages),
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const handleNewSession = useCallback(() => {
    const s = createEmptySession();
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
    setInput('');
    setSessionPopoverOpen(false);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setSessionPopoverOpen(false);
  }, []);

  const handleDeleteSession = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      const replacement = filtered.length === 0 ? [createEmptySession()] : filtered;
      if (id === activeSessionIdRef.current) {
        const oldIdx = prev.findIndex((s) => s.id === id);
        const pick = oldIdx > 0 ? oldIdx - 1 : 0;
        setActiveSessionId(replacement[pick].id);
      }
      return replacement;
    });
  }, []);

  const generateAIResponse = (userInput: string): string => {
    const lowerInput = userInput.toLowerCase();

    if (lowerInput.includes('课程') || lowerInput.includes('学习')) {
      return '关于课程学习，我建议你：\n\n1. 先浏览课程中心，选择感兴趣的课程\n2. 按照课程顺序完成实验\n3. 遇到问题可以随时问我\n4. 记得定期复习已学内容\n\n你想了解哪个具体课程呢？';
    }

    if (lowerInput.includes('容器') || lowerInput.includes('docker')) {
      return '关于容器的使用：\n\n• 容器是隔离的实验环境\n• 每个实验会自动创建对应的容器\n• 你可以在"我的容器"页面管理所有容器\n• 容器会在一段时间不活动后自动停止\n\n需要帮助管理容器吗？';
    }

    if (lowerInput.includes('实验') || lowerInput.includes('lab')) {
      return '实验相关提示：\n\n• 仔细阅读实验说明\n• 按步骤完成实验任务\n• 遇到错误不要慌，检查命令是否正确\n• 可以随时保存进度\n\n你在做哪个实验？遇到什么问题了吗？';
    }

    return '我理解你的问题了。作为星火 AI，我会尽力帮助你。\n\n你可以问我关于：\n• 课程内容和学习路径\n• 实验操作和技术问题\n• 编程语言和代码调试\n• 学习方法和建议\n\n请告诉我更多细节，我会给你更具体的帮助！';
  };

  const handleSend = () => {
    if (!input.trim() || isTyping || !activeSessionId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    patchActiveSession((s) => ({
      ...s,
      messages: [...s.messages, userMessage],
    }));
    setInput('');
    setIsTyping(true);
    setIsThinking(true);

    const sessionAtSend = activeSessionIdRef.current;

    setTimeout(() => {
      if (activeSessionIdRef.current !== sessionAtSend) return;

      setIsThinking(false);
      const fullResponse = generateAIResponse(userMessage.content);

      let currentIndex = 0;
      streamIntervalRef.current = setInterval(() => {
        if (activeSessionIdRef.current !== sessionAtSend) {
          if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          return;
        }
        if (currentIndex < fullResponse.length) {
          setStreamingContent(fullResponse.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          const aiResponse: Message = {
            id: `${Date.now() + 1}`,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
          };
          patchActiveSession((s) => ({
            ...s,
            messages: [...s.messages, aiResponse],
          }));
          setStreamingContent('');
          setIsTyping(false);
        }
      }, 20);
    }, 800 + Math.random() * 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
  };

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const formatSessionTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!hydrated) {
    return <LoadingBar text="加载中" />;
  }

  return (
    <div
      className={
        embed
          ? 'flex h-screen min-h-0 flex-col overflow-hidden bg-background text-on-surface'
          : 'flex min-h-screen overflow-x-hidden bg-background text-on-surface'
      }
    >
      {!embed && (user?.role === 'TEACHER' ? <TeacherSidebar /> : <Sidebar />)}

      <main
        className={
          embed
            ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden'
            : 'flex h-screen min-w-0 flex-1 flex-col overflow-x-hidden lg:ml-64'
        }
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <div className="min-w-0 flex-1" />
          <div className="flex min-w-0 flex-col items-center px-2">
            <div className="truncate text-sm font-medium text-on-surface">
              {activeSession?.title ?? '新对话'}
            </div>
            <div className="text-[10px] text-on-surface-variant">内容由 AI 生成</div>
          </div>
          <div className="relative flex min-w-0 flex-1 justify-end" ref={sessionPopoverRef}>
            <button
              type="button"
              onClick={() => setSessionPopoverOpen((o) => !o)}
              className={`rounded-xl p-2 text-on-surface-variant outline-none transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                sessionPopoverOpen ? 'bg-surface-container text-on-surface' : ''
              }`}
              title="会话"
              aria-haspopup="dialog"
              aria-expanded={sessionPopoverOpen}
              aria-controls="session-popover-panel"
            >
              <MessagesSquare className="h-5 w-5" />
            </button>

            <AnimatePresence>
              {sessionPopoverOpen && (
                <motion.div
                  key="session-popover"
                  id="session-popover-panel"
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="session-popover-title"
                  className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-2rem),19rem)] origin-top-right"
                  initial={{ x: 36, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 36, opacity: 0 }}
                  transition={{
                    duration: 0.45,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                <div className="relative flex max-h-[min(70vh,24rem)] flex-col overflow-hidden rounded-xl bg-surface-lowest shadow-none dark:bg-surface-low">
                  <div className="shrink-0 px-4 pb-1 pt-3">
                    <h2
                      id="session-popover-title"
                      className="text-[13px] font-semibold tracking-wide text-on-surface"
                    >
                      历史会话
                    </h2>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant/90">
                      选择一条继续聊
                    </p>
                  </div>

                  <div className="min-h-0 flex-1 px-2 pb-1">
                    <ul className="max-h-[min(48vh,300px)] space-y-0.5 overflow-y-auto py-1 scrollbar-hide">
                      {sortedSessions.map((s) => (
                        <li key={s.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectSession(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectSession(s.id);
                              }
                            }}
                            className={`group relative flex cursor-pointer items-center gap-2 rounded-lg py-2 pl-3 pr-2 text-left transition-colors ${
                              s.id === activeSessionId
                                ? 'bg-surface-container text-on-surface dark:bg-surface-container/90'
                                : 'text-on-surface hover:bg-surface-container/70 dark:hover:bg-surface-container/40'
                            }`}
                          >
                            {s.id === activeSessionId && (
                              <span
                                className="absolute left-1 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                                aria-hidden
                              />
                            )}
                            <div className="min-w-0 flex-1 pl-1">
                              <p className="truncate text-sm font-medium leading-snug">{s.title}</p>
                              <p className="mt-0.5 text-[10px] tabular-nums text-on-surface-variant">
                                {formatSessionTime(s.updatedAt)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(s.id, e)}
                              className="shrink-0 rounded-md p-1.5 text-on-surface-variant opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="shrink-0 bg-surface-container/30 px-2 py-2 dark:bg-surface-container/20">
                    <button
                      type="button"
                      onClick={handleNewSession}
                      className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container/80 hover:text-primary dark:hover:bg-surface-container/50"
                      title="新建会话"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5 opacity-80" />
                      新建会话
                    </button>
                  </div>
                </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {messages.length === 0 && !isTyping ? (
            <div className="flex h-full flex-col items-center justify-center px-4">
              <div className="mb-12 mt-[-10vh] text-center">
                <h1 className="mb-2 text-[28px] font-semibold text-slate-900 dark:text-white">
                  有什么可以帮你的？
                </h1>
              </div>

              <div className="mb-8 w-full max-w-3xl space-y-2">
                {[0, 1, 2].map((rowIndex) => (
                  <div key={rowIndex} className="flex flex-wrap justify-center gap-2">
                    {suggestions.slice(rowIndex * 3, rowIndex * 3 + 3).map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="admin-control max-w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium text-on-surface hover:bg-primary/10"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((message) => (
                <div key={message.id} className="mb-6">
                  {message.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="app-card max-w-[80%] rounded-3xl px-5 py-3">
                        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="group">
                      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-on-surface">
                        {message.content}
                      </div>
                      <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(message.content)}
                          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
                          title="复制"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
                          title="分享"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
                          title="好评"
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
                          title="差评"
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="mb-6">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-sm text-on-surface-variant">正在思考...</span>
                  </div>
                </div>
              )}

              {streamingContent && !isThinking && (
                <div className="mb-6">
                  <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-on-surface">
                    {streamingContent}
                    <span className="ml-1 inline-block h-5 w-0.5 animate-pulse bg-primary" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-background pb-6">
          <div className="mx-auto max-w-3xl px-4">
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleQuickAction(action.prompt)}
                  className="admin-control flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-on-surface hover:bg-primary/10"
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="relative rounded-[28px] bg-surface-lowest shadow-none dark:bg-surface-container">
              <div className="flex items-end gap-2 p-2.5">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-low dark:hover:bg-surface-high"
                  title="附件"
                >
                  <Plus className="h-[18px] w-[18px]" />
                </button>

                <div className="flex min-h-[36px] flex-1 items-center">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="尽管问..."
                    className="w-full resize-none border-0 bg-transparent py-1.5 text-[15px] leading-6 text-on-surface shadow-none placeholder:text-on-surface-variant/50 focus:outline-none"
                    rows={1}
                    disabled={isTyping}
                    style={{
                      minHeight: '24px',
                      maxHeight: '200px',
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                  title="发送"
                >
                  <ArrowUp className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-on-surface-variant/60">
              内容由 AI 生成，请仔细甄别
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function AIAssistantWithSearchParams() {
  const sp = useSearchParams();
  const embed = sp.get('embed') === '1';
  return <AIAssistantPageInner embed={embed} />;
}

export default function AIAssistantPage() {
  return (
    <Suspense fallback={<LoadingBar text="加载中" />}>
      <AIAssistantWithSearchParams />
    </Suspense>
  );
}
