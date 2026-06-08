'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

function ThemeTestContent() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-on-surface p-8">
      
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-page-title mb-4">主题系统测试页面</h1>
          <p className="text-on-surface-variant">
            当前主题: <span className="font-bold text-page-title">{theme === 'dark' ? '暗黑模式' : '浅色模式'}</span>
          </p>
        </div>

        {/* 颜色卡片 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">背景色层级</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-surface-lowest p-6 rounded-xl">
              <p className="text-sm text-on-surface-variant mb-1">surface-lowest</p>
              <p className="text-xs text-on-surface-variant opacity-70">最低层</p>
            </div>
            <div className="bg-surface-low p-6 rounded-xl">
              <p className="text-sm text-on-surface-variant mb-1">surface-low</p>
              <p className="text-xs text-on-surface-variant opacity-70">低层</p>
            </div>
            <div className="bg-surface-container p-6 rounded-xl">
              <p className="text-sm text-on-surface-variant mb-1">surface-container</p>
              <p className="text-xs text-on-surface-variant opacity-70">容器</p>
            </div>
            <div className="bg-surface-high p-6 rounded-xl">
              <p className="text-sm text-on-surface-variant mb-1">surface-high</p>
              <p className="text-xs text-on-surface-variant opacity-70">高层</p>
            </div>
            <div className="bg-surface-bright p-6 rounded-xl">
              <p className="text-sm text-on-surface-variant mb-1">surface-bright</p>
              <p className="text-xs text-on-surface-variant opacity-70">明亮层</p>
            </div>
            <div className="app-card p-6">
              <p className="text-sm text-on-surface-variant mb-1">surface-container-high</p>
              <p className="text-xs text-on-surface-variant opacity-70">高容器</p>
            </div>
          </div>
        </section>

        {/* 文字颜色 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">文字颜色</h2>
          <div className="app-card p-6 space-y-3">
            <p className="text-primary text-lg font-bold">主色文字 (primary)</p>
            <p className="text-on-surface">表面文字 (on-surface)</p>
            <p className="text-on-surface-variant">次要文字 (on-surface-variant)</p>
            <p className="text-primary-dim">暗主色文字 (primary-dim)</p>
          </div>
        </section>

        {/* 按钮样式 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">按钮样式</h2>
          <div className="flex flex-wrap gap-4">
            <button className="bg-primary text-on-primary px-6 py-3 rounded-full hover:opacity-90 transition-all">
              主要按钮
            </button>
            <button className="bg-surface-container-high text-primary border-0 px-6 py-3 rounded-full hover:bg-primary/10 transition-all">
              次要按钮
            </button>
            <button className="bg-surface-container text-on-surface-variant px-6 py-3 rounded-full hover:bg-surface-bright transition-all">
              普通按钮
            </button>
            <button className="bg-green-500 text-white px-6 py-3 rounded-full hover:bg-green-600 transition-all">
              成功按钮
            </button>
            <button className="bg-red-500 text-white px-6 py-3 rounded-full hover:bg-red-600 transition-all">
              危险按钮
            </button>
          </div>
        </section>

        {/* 卡片样式 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">卡片样式</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="app-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container dark:hover:bg-surface-container/50 cursor-pointer">
                <h3 className="text-lg font-bold text-page-title mb-2">卡片标题 {i}</h3>
                <p className="text-sm text-on-surface-variant mb-4">
                  这是一个示例卡片，展示了在不同主题下的显示效果。
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-on-surface-variant">详细信息</span>
                  <button className="text-primary hover:underline text-sm">查看更多</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 表单元素 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">表单元素</h2>
          <div className="app-card p-6 space-y-4">
            <div>
              <label className="block text-sm text-on-surface-variant mb-2">输入框</label>
              <input
                type="text"
                placeholder="请输入内容..."
                className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-on-surface-variant mb-2">文本域</label>
              <textarea
                placeholder="请输入多行内容..."
                rows={4}
                className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="checkbox"
                className="w-4 h-4 rounded border-outline-variant"
              />
              <label htmlFor="checkbox" className="text-sm text-on-surface">
                复选框选项
              </label>
            </div>
          </div>
        </section>

        {/* 状态指示器 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">状态指示器（优化后）</h2>
          <div className="flex flex-wrap gap-4">
            <div className="bg-status-success-bg px-4 py-2 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
              <span className="text-sm text-status-success-text font-medium">运行中</span>
            </div>
            <div className="bg-status-info-bg px-4 py-2 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-info animate-pulse" />
              <span className="text-sm text-status-info-text font-medium">创建中</span>
            </div>
            <div className="bg-status-warning-bg px-4 py-2 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
              <span className="text-sm text-status-warning-text font-medium">警告</span>
            </div>
            <div className="bg-status-error-bg px-4 py-2 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-error" />
              <span className="text-sm text-status-error-text font-medium">错误</span>
            </div>
            <div className="bg-status-neutral-bg px-4 py-2 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-neutral" />
              <span className="text-sm text-status-neutral-text font-medium">已停止</span>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant mt-4">
            浅色模式使用柔和的背景色和深色文字，暗色模式使用深色背景和亮色文字
          </p>
        </section>

        {/* 边框和分隔线 */}
        <section>
          <h2 className="text-2xl font-bold text-page-title mb-4">边框和分隔线</h2>
          <div className="space-y-4">
            <div className="border border-outline-variant p-4 rounded-lg">
              <p className="text-on-surface">带边框的容器</p>
            </div>
            <div className="h-px bg-outline-variant" />
            <div className="border-l-4 border-primary pl-4">
              <p className="text-on-surface">左侧强调边框</p>
            </div>
          </div>
        </section>

        {/* 阴影效果 */}
        <section className="pb-12">
          <h2 className="text-2xl font-bold text-page-title mb-4">阴影效果（优化后）</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="app-card p-6 shadow-soft">
              <p className="text-on-surface font-medium mb-1">柔和小阴影</p>
              <p className="text-xs text-on-surface-variant">shadow-soft</p>
            </div>
            <div className="app-card p-6 shadow-soft-md">
              <p className="text-on-surface font-medium mb-1">柔和中阴影</p>
              <p className="text-xs text-on-surface-variant">shadow-soft-md</p>
            </div>
            <div className="app-card p-6 shadow-soft-lg">
              <p className="text-on-surface font-medium mb-1">柔和大阴影</p>
              <p className="text-xs text-on-surface-variant">shadow-soft-lg</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ThemeTestPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
        <p className="text-on-surface-variant">加载中...</p>
      </div>
    );
  }

  return <ThemeTestContent />;
}
