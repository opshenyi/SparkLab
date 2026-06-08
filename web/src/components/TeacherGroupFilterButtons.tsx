'use client';

type GroupItem = { id: string; name: string };

type Props = {
  groups: GroupItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
};

/** 横向按钮切换当前学习小组（无图标、无「筛选」前缀文案） */
export default function TeacherGroupFilterButtons({ groups, value, onChange, className }: Props) {
  if (groups.length === 0) return null;
  return (
    <div className={className ?? 'mt-5 flex flex-wrap gap-2'}>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onChange(g.id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            value === g.id
              ? 'bg-surface-high text-on-surface shadow-[var(--shadow-ring)]'
              : 'admin-control text-on-surface'
          }`}
        >
          {g.name}
        </button>
      ))}
    </div>
  );
}
