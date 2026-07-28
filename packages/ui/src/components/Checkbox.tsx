'use client';

import { Check } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { useFieldIds, type FieldBaseProps } from './Field';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>,
    FieldBaseProps {
  label?: ReactNode;
  /** Description secondaire affichée sous le libellé. */
  description?: ReactNode;
}

/** Case à cocher stylée s'appuyant sur un `<input type="checkbox">` natif. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      label,
      description,
      hint,
      error,
      containerClassName,
      id,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    const ids = useFieldIds(id, hint, error);

    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
            <input
              ref={ref}
              id={ids.id}
              type="checkbox"
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={ids.describedBy}
              className={cn(
                'peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed',
                // L'input transparent est ce qu'on touche : on le recentre et
                // on l'agrandit à 44 px au doigt, le carré visible de 18 px
                // reste intact (sinon la ligne label/description se décalerait).
                'kt-tap-overlay',
                className,
              )}
              {...rest}
            />
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none flex size-full items-center justify-center rounded-[4px]',
                'border-2 border-fg-subtle bg-transparent transition-colors',
                'peer-checked:border-accent-fg peer-checked:bg-accent-fg',
                'peer-checked:[&>svg]:opacity-100',
                'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg',
                'peer-disabled:opacity-50',
                error && 'border-danger',
              )}
            >
              <Check size={12} strokeWidth={3.5} className="text-bg opacity-0" />
            </span>
          </span>

          {label || description ? (
            <span className="flex min-w-0 flex-col">
              <label
                htmlFor={ids.id}
                className={cn(
                  'cursor-pointer text-kt-base text-fg',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {label}
              </label>
              {description ? (
                <span className="text-kt-sm text-fg-subtle">{description}</span>
              ) : null}
            </span>
          ) : null}
        </div>

        {hint && !error ? (
          <p id={ids.hintId} className="text-kt-sm text-fg-subtle">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={ids.errorId} role="alert" className="text-kt-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
