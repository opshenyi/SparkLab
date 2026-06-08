'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import UpdateNotifier from './UpdateNotifier';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <UpdateNotifier />
    </ThemeProvider>
  );
}
