'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import {
  Field,
  FIELD_CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  useFieldIds,
  type FieldBaseProps,
} from './Field';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    FieldBaseProps {
  inputSize?: InputSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const SIZES: Record<InputSize, string> = {
  sm: 'h-8 text-kt-sm',
  md: 'h-10',
  lg: 'h-12 text-kt-md',
};

/** Champ texte à ligne unique. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    containerClassName,
    inputSize = 'md',
    iconLeft,
    iconRight,
    id,
    className,
    required,
    type = 'text',
    ...rest
  },
  ref,
) {
  const ids = useFieldIds(id, hint, error);

  return (
    <Field
      ids={ids}
      label={label}
      hint={hint}
      error={error}
      required={required}
      containerClassName={containerClassName}
    >
      <div className="relative flex items-center">
        {iconLeft ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 flex text-fg-subtle"
          >
            {iconLeft}
          </span>
        ) : null}

        <input
          ref={ref}
          id={ids.id}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cn(
            FIELD_CONTROL_CLASS,
            SIZES[inputSize],
            iconLeft && 'pl-9',
            iconRight && 'pr-9',
            error && FIELD_ERROR_CLASS,
            className,
          )}
          {...rest}
        />

        {iconRight ? (
          <span className="absolute right-3 flex text-fg-subtle">{iconRight}</span>
        ) : null}
      </div>
    </Field>
  );
});
