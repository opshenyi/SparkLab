'use client';

type Variant = 'none' | 'no-online';

type Props = {
  context?: string;
  variant?: Variant;
};

export function AdminNoServersPrompt({ context, variant = 'none' }: Props) {
  const title = variant === 'no-online' ? '本机 Docker 暂不可用' : '本机 Docker 未连接';
  const message = `${context || '当前功能'} 直接使用 unix:///var/run/docker.sock，请确认 Docker 正在运行，并且后端容器已挂载 /var/run/docker.sock。`;

  return (
    <div className="app-card rounded-2xl border border-outline-variant/60 bg-surface-container/40 p-10 text-center dark:bg-surface-container/20">
      <p className="mb-2 text-lg font-semibold text-on-surface">{title}</p>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-on-surface-variant">
        {message}
      </p>
      <div className="mx-auto mt-6 max-w-lg rounded-xl bg-surface-low p-4 text-left text-xs leading-relaxed text-on-surface-variant">
        <div>检查命令：</div>
        <div className="mt-2 font-mono text-on-surface">docker compose logs backend</div>
        <div className="mt-1 font-mono text-on-surface">docker ps</div>
      </div>
    </div>
  );
}
