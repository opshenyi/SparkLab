'use client';

export const ADMIN_ALL_SERVERS = 'all';

export type AdminServerPickerItem = { id: string; name: string; status?: string };

type Props = {
  servers: AdminServerPickerItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** 可选的「全部」选项 */
  showAllOption?: boolean;
  /** 例如：全部 (12) */
  allLabel?: string;
};

/** 管理端：本机 Docker 资源切换按钮样式。 */
export default function AdminServerPickerButtons({
  servers,
  value,
  onChange,
  className,
  showAllOption,
  allLabel,
}: Props) {
  if (servers.length === 0 && !showAllOption) return null;
  return (
    <div className={className ?? 'flex flex-wrap gap-2'}>
      {showAllOption && (
        <button
          type="button"
          onClick={() => onChange(ADMIN_ALL_SERVERS)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            value === ADMIN_ALL_SERVERS
              ? 'bg-surface-high text-on-surface shadow-[var(--shadow-ring)]'
              : 'admin-control text-on-surface'
          }`}
        >
          {allLabel ?? '全部'}
        </button>
      )}
      {servers.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            value === s.id ? 'bg-surface-high text-on-surface shadow-[var(--shadow-ring)]' : 'admin-control text-on-surface'
          }`}
        >
          {s.status ? (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                s.status === 'online' ? 'bg-status-success' : 'bg-status-neutral'
              }`}
            />
          ) : null}
          {s.name}
        </button>
      ))}
    </div>
  );
}
