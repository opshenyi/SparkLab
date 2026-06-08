'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
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

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'var(--font-jetbrains-mono)',
      theme: {
        background: '#000000',
        foreground: '#f5f5f7',
        cursor: '#f5f5f7',
        selectionBackground: 'rgba(41, 151, 255, 0.32)',
        black: '#000000',
        brightBlack: '#666666',
        white: '#f5f5f7',
        brightWhite: '#ffffff',
        blue: '#2997ff',
        brightBlue: '#5eb3ff',
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

      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (e) {
          console.error('Failed to fit terminal:', e);
        } finally {
          setIsReady(true);
        }
      }, 100);
    } catch (e) {
      console.error('Failed to initialize terminal:', e);
      setError('终端初始化失败');
      return;
    }

    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
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

    const handleResize = () => {
      try {
        fitAddonRef.current?.fit();
      } catch (e) {
        console.error('Failed to fit terminal on resize:', e);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [isReady, serverId, containerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="terminal-shell flex h-[80vh] w-[90vw] max-w-7xl flex-col overflow-hidden rounded-lg">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">终端 · {containerName}</h3>
            <p className="mt-0.5 text-xs text-white/50">
              {isConnecting ? '正在连接容器会话' : error || '已连接'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/16"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-black p-4">
          <div ref={terminalRef} className="terminal-scrollbar h-full w-full" />
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-xs text-white/48">提示：使用 Ctrl+C 中断当前命令。</p>
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
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
