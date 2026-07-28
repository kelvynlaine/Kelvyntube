'use client';

import { ChevronDown } from 'lucide-react';
import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../cn';
import {
  Field,
  FIELD_CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  useFieldIds,
  type FieldBaseProps,
} from './Field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'>,
    FieldBaseProps {
  /** Options simples ; ignorées si `children` est fourni. */
  options?: SelectOption[];
  /** Option vide affichée en tête de liste. */
  placeholder?: string;
  selectSize?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const SIZES = {
  sm: 'h-8 text-kt-sm',
  md: 'h-10',
  lg: 'h-12 text-kt-md',
} as const;

/** Liste déroulante native (accessible et légère). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    containerClassName,
    options,
    placeholder,
    selectSize = 'md',
    id,
    className,
    required,
    children,
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
        <select
          ref={ref}
          id={ids.id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cn(
            FIELD_CONTROL_CLASS,
            SIZES[selectSize],
            'cursor-pointer appearance-none pr-9',
            error && FIELD_ERROR_CLASS,
            className,
          )}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {children ??
            options?.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute right-3 text-fg-muted"
        />
      </div>
    </Field>
  );
});
