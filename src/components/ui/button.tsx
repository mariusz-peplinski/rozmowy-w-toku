import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('btn gap-2 shadow-none transition-colors duration-150', {
  variants: {
    variant: {
      default: 'bg-base-100 border border-base-300 hover:bg-base-200 hover:border-base-content/25 text-base-content',
      primary: 'btn-primary border border-primary hover:brightness-110',
      secondary: 'btn-secondary border border-secondary hover:brightness-110',
      accent: 'btn-accent border border-accent hover:brightness-110',
      danger: 'btn-error border border-error hover:brightness-110',
      success: 'btn-success border border-success hover:brightness-110',
      outline: 'btn-outline border hover:bg-base-200 hover:border-base-content/25',
      ghost: 'btn-ghost hover:bg-base-200',
      link: 'btn-link',
    },
    size: {
      sm: 'btn-sm px-3',
      default: 'px-4',
      lg: 'btn-lg px-6',
      xl: 'btn-lg text-lg px-7',
      icon: 'btn-square btn-sm p-0',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const isDisabled = disabled || loading

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : null}
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
