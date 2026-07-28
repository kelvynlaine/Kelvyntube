import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../cn';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  className?: string;
}

const VARIANTS: Record<SkeletonVariant, string> = {
  text: 'h-3 w-full rounded-pill',
  rect: 'rounded-kt',
  circle: 'rounded-full',
};

/** Bloc de chargement animé (voir `.kt-skeleton` dans styles.css). */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { variant = 'rect', className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('kt-skeleton', VARIANTS[variant], className)}
      {...rest}
    />
  );
});
