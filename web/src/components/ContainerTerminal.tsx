'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X } from 'lucide-react';
import { backendWsHost } from '@/lib/backendWs';

interface ContainerTerminalProps {
  serverId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export default function ContainerTerminal({
  serverId,
  containerId,
  containerName,
  onClose,
}: ContainerTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 初始化终端
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'var(--font-jetbrains-mono)',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
      },
      rows: 30,
      cols: 100,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    try {
      term.open(terminalRef.current);
      termRef.current = term;
      fitAddonRef.current = fitAddon;
      
      // 延迟调用 fit 以确保 DOM 已渲染
      setTimeout(() => {
        try {
          fitAddon.fit();
          setIsReady(true);
        } catch (e) {
          console.error('Failed to fit terminal:', e);
          setIsReady(true); // 即使 fit 失败也继续
        }
      }, 100);
    } catch (e) {
      console.error('Failed to initialize terminal:', e);
      setError('终端初始化失败');
      return;
    }

    // 清理函数
    return () => {
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      }
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (!isReady || !termRef.current) return;

    const term = termRef.current;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${backendWsHost()}/servers/${serverId}/containers/${containerId}/terminal`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);

      // 监听用户输入
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('连接失败');
    };

    ws.onclose = () => {
      setIsConnecting(false);
    };

    // 窗口大小调整
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          console.error('Failed to fit terminal on resize:', e);
        }
      }
    };
    window.addEventListener('resize', handleResize);

    // 清理
    return () => {
      window.removeEventListener('resize', handleResize);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [isReady, serverId, containerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="app-card shadow-2xl w-[90vw] h-[80vh] max-w-7xl flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <h3 className="text-page-title text-lg font-bold">
              终端 - {containerName}
            </h3>
            {isConnecting && (
              <span className="text-sm text-on-surface-variant">连接中...</span>
            )}
            {error && (
              <span className="text-sm text-red-400">{error}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-bright rounded-lg transition-colors"
            title="关闭终端"
          >
            <X className="w-5 h-5 text-on-surface-variant" />
          </button>
        </div>

        {/* 终端区域 */}
        <div className="flex-1 p-4 overflow-hidden">
          <div
            ref={terminalRef}
            className="w-full h-full terminal-scrollbar"
            style={{ backgroundColor: '#000000' }}
          />
        </div>

        {/* 底部提示 */}
        <div className="p-3 bg-surface-container">
          <p className="text-xs text-on-surface-variant">
            提示: 使用 Ctrl+C 中断命令
          </p>
        </div>
      </div>

      <style jsx>{`
        .terminal-scrollbar :global(.xterm-viewport) {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
        }

        .terminal-scrollbar :global(.xterm-viewport::-webkit-scrollbar) {
          width: 8px;
        }

        .terminal-scrollbar :global(.xterm-viewport::-webkit-scrollbar-track) {
          background: transparent;
        }

        .terminal-scrollbar :global(.xterm-viewport::-webkit-scrollbar-thumb) {
          background-color: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .terminal-scrollbar :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
          background-color: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
}

