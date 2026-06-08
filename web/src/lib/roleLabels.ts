import type { CSSProperties } from 'react';

/** 与后端 users.role 字符串一致 */
export const ROLE_LABELS: Record<string, string> = {
  STUDENT: '学生',
  TEACHER: '老师',
  ADMIN: '管理员',
  AUTHOR: '超管',
};

export function roleLabel(role: string | undefined | null): string {
  if (!role) return ROLE_LABELS.STUDENT;
  return ROLE_LABELS[role] ?? role;
}

/** 角色标签底色与文字色：必须用内联 style + CSS 变量，避免 Tailwind 未生成 bg-role-* / 动态 class 失效 */
export function roleBadgeColorsStyle(role: string | undefined | null): CSSProperties {
  switch (role) {
    case 'ADMIN':
      return {
        backgroundColor: 'var(--color-info-bg)',
        color: 'var(--color-info-text)',
      };
    case 'AUTHOR':
      return {
        backgroundColor: 'var(--color-role-author-bg)',
        color: 'var(--color-role-author-text)',
      };
    case 'TEACHER':
      return {
        backgroundColor: 'var(--color-role-teacher-bg)',
        color: 'var(--color-role-teacher-text)',
      };
    default:
      return {
        backgroundColor: 'var(--color-surface-container)',
        color: 'var(--color-on-surface-variant)',
      };
  }
}

/** 表格内角色胶囊：布局类（Tailwind）+ 颜色（内联） */
export const ROLE_BADGE_LAYOUT_CLASS =
  'inline-block px-2 py-1 rounded-md text-xs font-medium';

/** 个人资料头像下圆角条：布局类 + 颜色（内联） */
export const ROLE_PROFILE_PILL_LAYOUT_CLASS =
  'inline-flex w-full min-w-0 items-center justify-center rounded-full px-3 py-1.5 text-center text-xs font-medium';
