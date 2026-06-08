'use client';

interface LoadingBarProps {
  text?: string;
  showProgress?: boolean;
}

export default function LoadingBar({ text = '星火实验室', showProgress = true }: LoadingBarProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-on-surface" aria-busy="true">
      <div className="w-full max-w-80 space-y-4">
        <div className="relative h-px overflow-hidden rounded-full bg-surface-high">
          {showProgress ? (
            <div
              className="absolute inset-y-0 left-0 bg-primary animate-progress-fill"
            />
          ) : (
            <div
              className="absolute inset-0 bg-primary/80 animate-loading-slide"
            />
          )}
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-on-surface-variant">{text}</p>
        </div>
      </div>
    </div>
  );
}
