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
            className="block text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-14 w-full rounded-xl bg-[#0f0f0f]/50 backdrop-blur-sm px-4 py-2 text-base text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-600 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
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

