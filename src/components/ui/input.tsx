import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const inputVariants = cva('input w-full border border-base-300 bg-base-100 px-3', {
  variants: {
    variant: {
      default: '',
      error: 'input-error border-error',
      success: 'input-success border-success',
    },
    inputSize: {
      sm: 'input-sm',
      default: '',
      lg: 'input-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    inputSize: 'default',
  },
})

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
        VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, variant, inputSize, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(inputVariants({ variant, inputSize, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = "Input";

export { Input, inputVariants };
