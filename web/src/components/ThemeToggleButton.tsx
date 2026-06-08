'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { useEffect, useRef, useState } from 'react';

export default function ThemeToggleButton() {
  const [mounted, setMounted] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = buttonRef.current;
    if (!button) return;

    // 获取按钮位置
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // 计算需要覆盖整个屏幕的半径
    const maxDistance = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    // 检查是否支持 View Transition API
    // @ts-ignore
    if (!document.startViewTransition) {
      // 不支持，直接切换
      toggleTheme();
      return;
    }

    // 使用 View Transition API
    // @ts-ignore
    const transition = document.startViewTransition(async () => {
      toggleTheme();
    });

    // 等待过渡准备好
    try {
      await transition.ready;
      
      // 自定义圆形扩展动画
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxDistance * 2}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 800,
          easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    } catch (error) {
      console.error('View transition error:', error);
    }
  };

  if (!mounted) {
    return (
      <button className="flex-shrink-0 rounded-full px-3 py-2 text-xs font-medium text-on-surface-variant transition-all">
        主题
      </button>
    );
  }

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      className="flex-shrink-0 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-all hover:bg-surface-high hover:text-on-surface"
      aria-label="切换主题"
      title={theme === 'dark' ? '切换到浅色模式' : '切换到暗黑模式'}
    >
      {theme === 'dark' ? '浅色' : '暗黑'}
    </button>
  );
}
