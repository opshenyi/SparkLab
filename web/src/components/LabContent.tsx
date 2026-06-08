'use client';

import ReactMarkdown from 'react-markdown';

interface LabContentProps {
  content: string;
  title: string;
}

export default function LabContent({ content, title }: LabContentProps) {
  return (
    <div className="h-full overflow-y-auto bg-surface-lowest p-6 text-on-surface">
      <h1 className="mb-6 text-3xl font-semibold text-page-title">{title}</h1>
      <div className="prose prose-invert max-w-none">
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-semibold text-page-title">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-semibold text-page-title">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-on-surface">{children}</h3>,
            p: ({ children }) => <p className="mb-4 leading-relaxed text-on-surface-variant">{children}</p>,
            code: ({ children }) => (
              <code className="rounded bg-surface-container px-2 py-1 font-mono text-sm text-on-surface">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="mb-4 overflow-x-auto rounded-lg bg-[var(--terminal-bg)] p-4 text-[var(--terminal-text)] shadow-[0_0_0_1px_var(--terminal-border)]">
                {children}
              </pre>
            ),
            ul: ({ children }) => <ul className="mb-4 list-inside list-disc space-y-2 text-on-surface-variant">{children}</ul>,
            ol: ({ children }) => <ol className="mb-4 list-inside list-decimal space-y-2 text-on-surface-variant">{children}</ol>,
            li: ({ children }) => <li className="ml-4">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 border-l border-primary pl-4 italic text-on-surface-variant">
                {children}
              </blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
