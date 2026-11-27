import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Museum-label badge: DM Mono small caps with a hairline outline, never a
  // filled pill. Colour lives in the ink and the rule; the ground stays paper.
  "inline-flex items-center rounded-sm border bg-transparent px-1.5 py-[3px] font-mono text-[0.6875rem] font-normal uppercase leading-none tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/60 text-primary",
        secondary: "border-foreground/35 text-foreground",
        destructive: "border-destructive/60 text-destructive",
        outline: "border-foreground/25 text-foreground/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
