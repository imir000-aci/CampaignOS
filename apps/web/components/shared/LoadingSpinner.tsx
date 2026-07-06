import { cn } from '@/lib/cn'

interface Props {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }

export function LoadingSpinner({ className, size = 'md' }: Props) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-current border-t-transparent',
        sizeMap[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  )
}
