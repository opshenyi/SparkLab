/**
 * 与个人资料页（Profile）一致的版心、字体栈与 MsCard 表面，避免教师端与资料页「两套皮」。
 */
export const profilePageFontClass =
  "font-[system-ui,'Segoe_UI_Variable','Segoe_UI',-apple-system,BlinkMacSystemFont,sans-serif]";

export const profilePageMainInnerClass =
  'mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10';

/** 同 Profile MsCard：浅底白块、无默认阴影、深色略抬表面 */
export const profilePageCardClass = 'rounded-2xl bg-surface-lowest shadow-none dark:bg-surface-low/90';

/** 与资料页「编辑资料」主按钮一致 */
export const profilePagePrimaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:opacity-90 disabled:opacity-50';
