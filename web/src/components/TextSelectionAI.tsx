'use client';

import { useState, useEffect, useRef } from 'react';

interface TextSelectionAIProps {
  containerId?: string;
  contentRef?: React.RefObject<HTMLDivElement>; // 内容区域的引用
}

export default function TextSelectionAI({ containerId, contentRef }: TextSelectionAIProps) {
  const [selectedText, setSelectedText] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [hasClicked, setHasClicked] = useState(false); // 记录是否已点击
  
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 处理普通页面文本选择
  useEffect(() => {
    const handleSelection = () => {
      // 如果已经点击过，不再显示按钮
      if (hasClicked) {
        return;
      }

      // 清除之前的定时器
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        // 检查选择是否在指定的内容区域内
        if (contentRef?.current && selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const isInsideContent = contentRef.current.contains(range.commonAncestorContainer);
          
          if (!isInsideContent) {
            // 如果选择不在内容区域内，不显示按钮
            return;
          }
        }

        // 1秒后显示菜单
        selectionTimeoutRef.current = setTimeout(() => {
          const currentSelection = window.getSelection();
          const currentText = currentSelection?.toString().trim();
          
          // 确保选择仍然存在
          if (currentText && currentText.length > 0 && currentSelection && currentSelection.rangeCount > 0) {
            try {
              const range = currentSelection.getRangeAt(0);
              
              // 再次检查是否在内容区域内
              if (contentRef?.current) {
                const isInsideContent = contentRef.current.contains(range.commonAncestorContainer);
                if (!isInsideContent) {
                  return;
                }
              }
              
              const rect = range.getBoundingClientRect();

              if (rect && rect.width > 0 && rect.height > 0) {
                setSelectedText(currentText);
                setMenuPosition({
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + window.scrollY + 8,
                });
              }
            } catch (error) {
              console.error('Selection error:', error);
            }
          }
        }, 1000);
      } else {
        setMenuPosition(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPosition(null);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('mousedown', handleClickOutside);
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [hasClicked, contentRef]); // 添加 contentRef 作为依赖

  const handleAskAI = async () => {
    setHasClicked(true); // 标记已点击
    setShowDialog(true);
    setMenuPosition(null);
    setIsLoading(true);
    setAiResponse('');

    // 初始化对话历史
    const initialMessage = { role: 'user' as const, content: selectedText };
    setConversationHistory([initialMessage]);

    try {
      // 调用星火AI API
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: selectedText,
          containerId: containerId,
        }),
      });

      if (!response.ok) {
        throw new Error('AI请求失败');
      }

      const data = await response.json();
      setAiResponse(data.answer || '抱歉，我无法回答这个问题。');
      setConversationHistory(prev => [...prev, { role: 'assistant', content: data.answer || '抱歉，我无法回答这个问题。' }]);
    } catch (error) {
      console.error('AI请求错误:', error);
      setAiResponse('抱歉，AI服务暂时不可用，请稍后再试。');
      setConversationHistory(prev => [...prev, { role: 'assistant', content: '抱歉，AI服务暂时不可用，请稍后再试。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpQuestion.trim()) return;

    const userMessage = { role: 'user' as const, content: followUpQuestion };
    setConversationHistory(prev => [...prev, userMessage]);
    setFollowUpQuestion('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: followUpQuestion,
          containerId: containerId,
          history: conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error('AI请求失败');
      }

      const data = await response.json();
      setConversationHistory(prev => [...prev, { role: 'assistant', content: data.answer || '抱歉，我无法回答这个问题。' }]);
    } catch (error) {
      console.error('AI请求错误:', error);
      setConversationHistory(prev => [...prev, { role: 'assistant', content: '抱歉，AI服务暂时不可用，请稍后再试。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setAiResponse('');
    setConversationHistory([]);
    setFollowUpQuestion('');
    setHasClicked(false); // 关闭对话框时重置状态，允许再次使用
  };

  return (
    <>
      {/* 文本选择菜单 */}
      {menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-[9999]"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
            transform: 'translateX(-50%)',
            animation: 'popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          }}
        >
          <button
            onClick={handleAskAI}
            className="bg-primary text-on-primary px-4 py-2 rounded-lg shadow-lg hover:opacity-90 transition-all whitespace-nowrap"
          >
            询问星火AI
          </button>
        </div>
      )}
      
      <style jsx>{`
        @keyframes popIn {
          0% {
            opacity: 0;
            transform: translateX(-50%) scale(0.3);
          }
          50% {
            transform: translateX(-50%) scale(1.1);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) scale(1);
          }
        }
      `}</style>

      {/* AI对话弹窗 */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="app-card w-full max-w-2xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
            {/* 头部 */}
            <div className="flex items-center justify-between p-6 border-b border-outline-variant">
              <div>
                <h2 className="text-page-title text-xl font-bold">星火AI助手</h2>
                <p className="text-xs text-on-surface-variant">智能问答助手</p>
              </div>
              <button
                onClick={handleCloseDialog}
                className="rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-high hover:text-on-surface"
              >
                关闭
              </button>
            </div>

            {/* 对话内容 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {conversationHistory.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-container rounded-2xl px-4 py-3 flex items-center gap-2">
                    <span className="text-sm text-on-surface-variant">AI正在思考...</span>
                  </div>
                </div>
              )}
            </div>

            {/* 输入框 */}
            <div className="p-4 border-t border-outline-variant">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={followUpQuestion}
                  onChange={(e) => setFollowUpQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleFollowUp();
                    }
                  }}
                  placeholder="继续提问..."
                  disabled={isLoading}
                  className="flex-1 bg-surface-container text-on-surface px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={isLoading || !followUpQuestion.trim()}
                  className="h-12 rounded-full bg-primary px-5 text-sm font-medium text-on-primary hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  发送
                </button>
              </div>
              <p className="text-xs text-on-surface-variant mt-2 text-center">
                按 Enter 发送，Shift + Enter 换行
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
