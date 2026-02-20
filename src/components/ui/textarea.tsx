import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const textareaVariants = cva('textarea w-full min-h-[100px] border border-base-300 bg-base-100 p-3', {
  variants: {
    variant: {
      default: '',
      error: 'textarea-error',
      success: 'textarea-success',
    },
    textareaSize: {
      sm: 'textarea-sm',
      default: '',
      lg: 'textarea-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    textareaSize: 'default',
  },
})

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
        VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, variant, textareaSize, ...props }, ref) => {
        return (
            <textarea
                className={cn(textareaVariants({ variant, textareaSize, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
