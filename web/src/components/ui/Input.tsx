import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, id, ...props }, ref) => {
    return (
      <div className="w-full space-y-2">
        {label && (
          <label
            htmlFor={id}
            className="ml-1 block text-xs font-medium text-on-surface-variant"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-12 w-full rounded-md bg-surface-lowest px-4 py-2 text-base text-on-surface file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
            className
          )}
          ref={ref}
          id={id}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
