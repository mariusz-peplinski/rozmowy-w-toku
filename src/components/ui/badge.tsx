import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('badge', {
  variants: {
    variant: {
      default: 'badge-neutral',
      primary: 'badge-primary',
      secondary: 'badge-secondary',
      accent: 'badge-accent',
      danger: 'badge-error',
      success: 'badge-success',
      outline: 'badge-outline',
    },
    size: {
      sm: 'badge-sm',
      default: 'badge-md',
      lg: 'badge-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
    ({ className, variant, size, ...props }, ref) => (
        <div ref={ref} className={cn(badgeVariants({ variant, size, className }))} {...props} />
    )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
