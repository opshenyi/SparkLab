'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePollWhileVisible } from '@/lib/usePollWhileVisible';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { labAPI, containerAPI } from '@/lib/api';
import LoadingBar from '@/components/LoadingBar';
import { Terminal, Monitor, Play, Square, Save, RotateCcw, Laptop, Globe, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Terminal as XTermType } from '@xterm/xterm';
import type { FitAddon as FitAddonType } from '@xterm/addon-fit';
import TextSelectionAI from '@/components/TextSelectionAI';
import { backendWsHost } from '@/lib/backendWs';

export default function LabPage() {
  const router = useRouter();
  const params = useParams();
  const labId = params.id as string;
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [lab, setLab] = useState<any>(null);
  const [container, setContainer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'vnc' | 'ssh' | 'rdp' | 'web'>('ssh');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [webLoadError, setWebLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTermType | null>(null);
  const fitAddonRef = useRef<FitAddonType | null>(null);
  const terminalWsRef = useRef<WebSocket | null>(null);
  const labContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated && labId) {
      loadLab();
      loadExistingContainer();
    }
  }, [isAuthenticated, labId]);

  const loadExistingContainer = useCallback(async () => {
    try {
      const res = await containerAPI.getAll();
      const existingContainer = res.data.find((c: any) => c.labId === labId);
      if (existingContainer) {
        setContainer(existingContainer);
      }
    } catch (error) {
      console.error('Failed to load existing container:', error);
    }
  }, [labId]);

  const pollContainer =
    !!container && (container.status === 'creating' || container.status === 'running');

  usePollWhileVisible(pollContainer, loadExistingContainer, 3000);

  useEffect(() => {
    if (container && container.status === 'running') {
      let defaultPort = '8080';
      try {
        const portMappings = container.portMappings ? JSON.parse(container.portMappings) : [];
        if (portMappings.length > 0) {
          defaultPort = portMappings[0].hostPort || defaultPort;
        }
      } catch (e) {
        console.error('Failed to parse port mappings:', e);
      }
      setWebUrl(`http://localhost:${defaultPort}`);
      setWebLoadError(false);
    } else {
      setWebUrl('');
      setWebLoadError(false);
    }
  }, [container]);

  useEffect(() => {
    if (!webUrl || webLoadError || activeTab !== 'web') return;

    const checkIframeLoad = setTimeout(() => {
      if (iframeRef.current) {
        try {
          const iframeDoc = iframeRef.current.contentDocument;
          if (!iframeDoc) {
            setWebLoadError(true);
          }
        } catch {
          setWebLoadError(true);
        }
      }
    }, 3000);

    return () => clearTimeout(checkIframeLoad);
  }, [webUrl, webLoadError, activeTab]);

  useEffect(() => {
    if (!container || container.status !== 'running' || !container.id || !terminalRef.current || xtermRef.current) {
      return;
    }

    let cancelled = false;

    (async () => {
      // @ts-expect-error xterm 样式无类型声明
      await import('@xterm/xterm/css/xterm.css');
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (cancelled || !terminalRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#ffffff',
          selectionBackground: 'rgba(255, 255, 255, 0.3)',
        },
        rows: 30,
        cols: 80,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      if (cancelled) {
        term.dispose();
        return;
      }

      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (e) {
          console.error('Failed to fit terminal:', e);
        }
      }, 100);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${backendWsHost()}/containers/${container.id}/terminal`;
      const socket = new WebSocket(wsUrl);
      terminalWsRef.current = socket;

      socket.onopen = () => {
        term.onData((data) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(data);
          }
        });
      };

      socket.onmessage = (event) => {
        term.write(event.data);
      };

      socket.onerror = () => {
        term.writeln('\r\n\x1b[31m连接失败\x1b[0m');
      };

      socket.onclose = () => {
        term.writeln('\r\n\x1b[33m连接已断开\x1b[0m');
      };

      const handleResize = () => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {
          console.error('Failed to fit terminal on resize:', e);
        }
      };
      window.addEventListener('resize', handleResize);

      (term as unknown as { __cleanupResize?: () => void }).__cleanupResize = () => {
        window.removeEventListener('resize', handleResize);
      };
    })();

    return () => {
      cancelled = true;
      const w = terminalWsRef.current;
      if (w && (w.readyState === WebSocket.OPEN || w.readyState === WebSocket.CONNECTING)) {
        w.close();
      }
      terminalWsRef.current = null;
      const term = xtermRef.current;
      const cleanup = (term as unknown as { __cleanupResize?: () => void })?.__cleanupResize;
      cleanup?.();
      term?.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [container?.id, container?.status]);

  useEffect(() => {
    if (activeTab === 'ssh' && xtermRef.current && fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {
          console.error('Failed to fit terminal on tab switch:', e);
        }
      }, 100);
    }
  }, [activeTab]);

  const loadLab = async () => {
    try {
      const res = await labAPI.getOne(labId);
      setLab(res.data);
    } catch (error) {
      console.error('Failed to load lab:', error);
    }
  };

  const handleStartContainer = async () => {
    setIsStarting(true);
    try {
      if (!container) {
        const res = await containerAPI.create(labId);
        setContainer(res.data);
      } else if (container.status === 'stopped') {
        await containerAPI.start(container.id);
        await loadExistingContainer();
      }
    } catch (error: unknown) {
      console.error('Failed to start container:', error);
      const ax = error as { response?: { data?: { message?: string } } };
      const msg = ax?.response?.data?.message;
      alert(typeof msg === 'string' && msg ? msg : '容器启动失败，请重试');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopContainer = async () => {
    if (!container) return;
    setIsStopping(true);
    setContainer({ ...container, status: 'stopping' });

    try {
      await containerAPI.stop(container.id);

      const w = terminalWsRef.current;
      if (w && (w.readyState === WebSocket.OPEN || w.readyState === WebSocket.CONNECTING)) {
        w.close();
      }
      terminalWsRef.current = null;
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }

      await loadExistingContainer();
    } catch (error) {
      console.error('Failed to stop container:', error);
      alert('停止容器失败，请重试');
      await loadExistingContainer();
    } finally {
      setIsStopping(false);
    }
  };

  const handleSubmit = async () => {
    if (!confirm('确定要提交实验吗？提交后容器将被销毁，所有数据将丢失！')) {
      return;
    }

    try {
      await labAPI.submit(labId);

      const w = terminalWsRef.current;
      if (w && (w.readyState === WebSocket.OPEN || w.readyState === WebSocket.CONNECTING)) {
        w.close();
      }
      terminalWsRef.current = null;
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
      setContainer(null);

      alert('实验已提交！容器已自动销毁。');
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to submit lab:', error);
      alert('提交失败，请重试');
    }
  };

  const handleBackToDashboard = () => {
    if (container && container.status === 'running') {
      if (
        !confirm(
          '当前容器正在运行中！\n\n请确认：\n1. 容器内的工作已保存\n2. 重要数据已备份\n\n离开后容器将继续运行，但可能会因此丢失上一步操作\n\n确定要返回大厅吗？'
        )
      ) {
        return;
      }
    }
    router.push('/dashboard');
  };

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const w = window as unknown as {
      testStartContainer?: () => unknown;
      testStopContainer?: () => void;
    };
    w.testStartContainer = () => {
      const mockContainer = {
        id: 'test-container-' + Date.now(),
        labId: labId,
        status: 'running',
        port: 8080,
        createdAt: new Date().toISOString(),
      };
      setContainer(mockContainer);
      return mockContainer;
    };
    w.testStopContainer = () => {
      const sock = terminalWsRef.current;
      if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
        sock.close();
      }
      terminalWsRef.current = null;
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
      setContainer(null);
    };
    return () => {
      delete w.testStartContainer;
      delete w.testStopContainer;
    };
  }, [labId]);

  if (isLoading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated || !lab) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background text-on-surface overflow-hidden">
      <TextSelectionAI containerId={container?.id} contentRef={labContentRef} />

      <div className="w-[35%] flex flex-col">
        <div className="p-4">
          <h1 className="text-page-title text-2xl font-bold mb-2">{lab.title}</h1>
          <p className="text-sm text-on-surface-variant mb-4">{lab.description}</p>

          {container && (
            <div className="mb-3 px-3 py-2 bg-surface-container rounded-lg flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  container.status === 'running'
                    ? 'bg-green-500 animate-pulse'
                    : container.status === 'creating'
                      ? 'bg-blue-500 animate-pulse'
                      : container.status === 'stopping'
                        ? 'bg-yellow-500 animate-pulse'
                        : container.status === 'stopped'
                          ? 'bg-gray-500'
                          : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-on-surface-variant">
                容器状态:{' '}
                {container.status === 'running'
                  ? '运行中'
                  : container.status === 'creating'
                    ? '创建中'
                    : container.status === 'stopping'
                      ? '停止中'
                      : container.status === 'stopped'
                        ? '已停止'
                        : container.status === 'error'
                          ? '错误'
                          : container.status}
              </span>
              {container.containerId && (
                <span className="text-xs text-on-surface-variant/70 ml-auto">
                  容器ID: {container.containerId.slice(0, 8)}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={handleStartContainer}
              disabled={
                container?.status === 'running' ||
                container?.status === 'creating' ||
                container?.status === 'stopping' ||
                isStarting
              }
              className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                container?.status === 'running' ||
                container?.status === 'creating' ||
                container?.status === 'stopping' ||
                isStarting
                  ? 'bg-gray-500 text-gray-300 cursor-not-allowed opacity-50'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {container?.status === 'stopped' ? '启动中...' : '创建中...'}
                </>
              ) : container?.status === 'creating' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {!container ? '创建容器' : container.status === 'stopped' ? '启动容器' : '启动容器'}
                </>
              )}
            </button>
            <button
              onClick={handleStopContainer}
              disabled={!container || container.status !== 'running' || isStopping}
              className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                !container || container.status !== 'running' || isStopping
                  ? 'bg-gray-500 text-gray-300 cursor-not-allowed opacity-50'
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              {isStopping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  停止中...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  停止容器
                </>
              )}
            </button>
            <button
              onClick={() => {
                xtermRef.current?.clear();
              }}
              disabled={!container || container.status !== 'running'}
              className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                !container || container.status !== 'running'
                  ? 'bg-gray-500 text-gray-300 cursor-not-allowed opacity-50'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              清空
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('ssh')}
              className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all text-sm ${
                activeTab === 'ssh'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
              }`}
            >
              <Terminal className="w-4 h-4" />
              SSH
            </button>
            <button
              onClick={() => setActiveTab('vnc')}
              className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all text-sm ${
                activeTab === 'vnc'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
              }`}
            >
              <Monitor className="w-4 h-4" />
              VNC
            </button>
            <button
              onClick={() => setActiveTab('rdp')}
              className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all text-sm ${
                activeTab === 'rdp'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
              }`}
            >
              <Laptop className="w-4 h-4" />
              IDE
            </button>
            <button
              onClick={() => setActiveTab('web')}
              className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all text-sm ${
                activeTab === 'web'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-bright'
              }`}
            >
              <Globe className="w-4 h-4" />
              Web
            </button>
          </div>
        </div>

        <div ref={labContentRef} className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{lab.content || '# 实验内容\n\n暂无内容'}</ReactMarkdown>
          </div>

          {lab.tasks && lab.tasks.length > 0 && (
            <div className="mt-8">
              <h3 className="text-page-title text-lg font-bold mb-4">实验任务</h3>
              <div className="space-y-3">
                {lab.tasks.map((task: string, index: number) => (
                  <div key={index} className="app-card flex items-start gap-3 p-4">
                    <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {index + 1}
                    </div>
                    <p className="text-sm text-on-surface-variant flex-1">{task}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 flex gap-3">
          <button
            onClick={handleBackToDashboard}
            className="flex-1 bg-surface-container text-on-surface-variant px-4 py-2.5 rounded-lg hover:bg-surface-bright transition-all text-sm"
          >
            返回大厅
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Save className="w-4 h-4" />
            提交实验
          </button>
        </div>
      </div>

      <div className="w-[65%] flex flex-col">
        <div className="flex-1 overflow-hidden relative">
          <div className={`h-full flex flex-col ${activeTab === 'ssh' ? '' : 'hidden'}`}>
            {!container ? (
              <div className="h-full bg-surface-container flex items-center justify-center">
                <div className="text-center">
                  <Terminal className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-50" />
                  <p className="text-on-surface-variant">请先启动容器</p>
                </div>
              </div>
            ) : (
              <div ref={terminalRef} className="h-full w-full bg-black" />
            )}
          </div>

          <div
            className={`h-full bg-surface-container flex items-center justify-center ${activeTab === 'vnc' ? '' : 'hidden'}`}
          >
            {container ? (
              <div className="text-center">
                <Monitor className="w-16 h-16 text-primary mx-auto mb-4" />
                <p className="text-on-surface-variant mb-2">VNC 连接</p>
                <p className="text-xs text-on-surface-variant">
                  容器 ID: {container.containerId?.slice(0, 8) || container.id.slice(0, 8)}
                </p>
                <p className="text-xs text-on-surface-variant mt-4">VNC 功能开发中...</p>
              </div>
            ) : (
              <div className="text-center">
                <Monitor className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-50" />
                <p className="text-on-surface-variant">请先启动容器</p>
              </div>
            )}
          </div>

          <div
            className={`h-full bg-surface-container flex items-center justify-center ${activeTab === 'rdp' ? '' : 'hidden'}`}
          >
            {container ? (
              <div className="text-center">
                <Laptop className="w-16 h-16 text-primary mx-auto mb-4" />
                <p className="text-on-surface-variant mb-2">IDE 连接</p>
                <p className="text-xs text-on-surface-variant">
                  容器 ID: {container.containerId?.slice(0, 8) || container.id.slice(0, 8)}
                </p>
                <p className="text-xs text-on-surface-variant mt-4">IDE 功能开发中...</p>
              </div>
            ) : (
              <div className="text-center">
                <Laptop className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-50" />
                <p className="text-on-surface-variant">请先启动容器</p>
              </div>
            )}
          </div>

          <div className={`h-full bg-surface-container flex flex-col ${activeTab === 'web' ? '' : 'hidden'}`}>
            {container ? (
              <>
                <div className="p-4 flex items-center gap-3">
                  <Globe className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm text-on-surface-variant mb-1">Web 访问地址</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={webUrl}
                        onChange={(e) => setWebUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setWebLoadError(false);
                          }
                        }}
                        placeholder="输入 Web 访问地址"
                        className="flex-1 bg-surface-container text-on-surface px-3 py-1.5 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(webUrl);
                          alert('已复制到剪贴板');
                        }}
                        className="px-3 py-1.5 bg-primary text-on-primary rounded text-sm hover:opacity-90 transition-all"
                      >
                        复制
                      </button>
                      <button
                        onClick={() => setWebLoadError(false)}
                        className="px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition-all"
                      >
                        刷新
                      </button>
                      <a
                        href={webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-all"
                      >
                        新窗口
                      </a>
                    </div>
                  </div>
                </div>
                <div className="flex-1 bg-white relative">
                  {webLoadError ? (
                    <div className="h-full bg-surface-container flex items-center justify-center">
                      <div className="text-center">
                        <Globe className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-50" />
                        <p className="text-on-surface-variant mb-2">无法连接到 Web 服务</p>
                        <p className="text-xs text-on-surface-variant mb-4">请检查容器是否已启动 Web 服务</p>
                        <p className="text-xs text-on-surface-variant mb-4">当前地址: {webUrl}</p>
                        <button
                          onClick={() => setWebLoadError(false)}
                          className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all"
                        >
                          重新加载
                        </button>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      ref={iframeRef}
                      key={webUrl}
                      src={webUrl}
                      className="w-full h-full border-0"
                      title="Container Web Access"
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Globe className="w-16 h-16 text-on-surface-variant mx-auto mb-4 opacity-50" />
                  <p className="text-on-surface-variant">请先启动容器</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
