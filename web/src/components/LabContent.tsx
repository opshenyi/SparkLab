'use client';

import ReactMarkdown from 'react-markdown';

interface LabContentProps {
  content: string;
  title: string;
}

export default function LabContent({ content, title }: LabContentProps) {
  return (
    <div className="h-full overflow-y-auto bg-[#1e1e1e] p-6">
      <h1 className="text-3xl font-bold mb-6 text-white">{title}</h1>
      <div className="prose prose-invert max-w-none">
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-white">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3 text-gray-200">{children}</h2>,
            h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-300">{children}</h3>,
            p: ({ children }) => <p className="mb-4 text-gray-300 leading-relaxed">{children}</p>,
            code: ({ children }) => (
              <code className="bg-[#2d2d2d] px-2 py-1 rounded text-sm text-green-400 font-mono">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-[#2d2d2d] p-4 rounded-lg overflow-x-auto mb-4 border border-gray-700">
                {children}
              </pre>
            ),
            ul: ({ children }) => <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-4 text-gray-300 space-y-2">{children}</ol>,
            li: ({ children }) => <li className="ml-4">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-400 my-4">
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

