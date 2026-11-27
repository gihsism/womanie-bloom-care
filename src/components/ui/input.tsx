import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // iOS Safari draws today's date inside an EMPTY date field, so it looks
    // filled in when nothing is saved. Mark empty controlled date fields;
    // index.css (iOS only) hides that phantom date and shows the
    // placeholder instead. The value itself is untouched.
    const isEmptyDate =
      (type === "date" || type === "datetime-local" || type === "time") &&
      "value" in props &&
      (props.value === "" || props.value == null);
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-sm border border-input bg-card px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        data-empty={isEmptyDate ? "true" : undefined}
        placeholder={isEmptyDate ? props.placeholder ?? "Not set · tap to choose" : props.placeholder}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
