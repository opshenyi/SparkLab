'use client';

import Link from 'next/link';

type Variant = 'none' | 'no-online';

type Props = {
  /** 页面名称，用于文案 */
  context?: string;
  /** none：库里没有任何服务器；no-online：有记录但当前无在线节点 */
  variant?: Variant;
};

export function AdminNoServersPrompt({ context, variant = 'none' }: Props) {
  if (variant === 'no-online') {
    return (
      <div className="app-card rounded-2xl border border-outline-variant/60 bg-surface-container/40 p-10 text-center dark:bg-surface-container/20">
        <p className="text-lg font-semibold text-on-surface mb-2">当前没有在线的服务器</p>
        <p className="text-sm text-on-surface-variant mb-6 max-w-md mx-auto leading-relaxed">
          {context
            ? `「${context}」需要至少一台状态为在线的服务器。请到服务器管理检查连接与心跳。`
            : '请先到服务器管理检查各节点是否在线。'}
        </p>
        <Link
          href="/admin/servers"
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-95"
        >
          前往服务器管理
        </Link>
      </div>
    );
  }

  return (
    <div className="app-card rounded-2xl border border-outline-variant/60 bg-surface-container/40 p-10 text-center dark:bg-surface-container/20">
      <p className="text-lg font-semibold text-on-surface mb-2">还没有添加服务器</p>
      <p className="text-sm text-on-surface-variant mb-6 max-w-md mx-auto leading-relaxed">
        {context
          ? `「${context}」依赖已接入的 Docker 执行节点。请先在服务器管理中新增服务器并完成连接，再管理镜像、容器与存储卷。`
          : '请先在服务器管理中新增服务器并完成连接，再使用镜像、容器与存储卷等功能。'}
      </p>
      <Link
        href="/admin/servers"
        className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-95"
      >
        去添加服务器
      </Link>
    </div>
  );
}
