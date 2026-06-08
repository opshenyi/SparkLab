import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
          variant === 'primary' && "bg-primary text-on-primary hover:opacity-90",
          variant === 'ghost' && "bg-surface-lowest text-on-surface shadow-[var(--shadow-ring)] hover:bg-surface-container",
          size === 'default' && "h-11 px-6",
          size === 'sm' && "h-9 px-4",
          size === 'lg' && "h-12 px-8 text-base",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
