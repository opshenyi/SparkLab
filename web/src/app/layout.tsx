import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: '星火实验室 | 在线容器化教学系统',
  description: '面向计算机专业学生的在线实训平台。在安全隔离的环境中，快速部署容器，完成实验任务,提升实践能力。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'dark';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="selection:bg-primary selection:text-on-primary">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
