'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { useFieldIds, type FieldBaseProps } from './Field';

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'>,
    FieldBaseProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
}

/** Interrupteur ON/OFF — `role="switch"` piloté au clavier (Espace / Entrée). */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    checked,
    onCheckedChange,
    label,
    description,
    hint,
    error,
    containerClassName,
    size = 'md',
    id,
    className,
    disabled,
    onClick,
    ...rest
  },
  ref,
) {
  const ids = useFieldIds(id, hint, error);
  const small = size === 'sm';

  const control = (
    <button
      ref={ref}
      id={ids.id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={ids.describedBy}
      aria-labelledby={label ? `${ids.id}-label` : undefined}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-pill transition-colors duration-150 kt-focus-ring',
        // Ici la taille EST le style : un interrupteur de 44 px de haut ne
        // ressemblerait plus à rien. On étend donc la zone sensible avec un
        // pseudo-élément, la piste et le curseur gardent leurs dimensions.
        'kt-tap-halo',
        small ? 'h-4 w-8' : 'h-5 w-10',
        checked ? 'bg-accent-fg' : 'bg-bg-active',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute rounded-full bg-bg-inverse shadow transition-transform duration-150',
          small ? 'size-3 translate-x-0.5' : 'size-4 translate-x-0.5',
          checked && (small ? 'translate-x-[18px]' : 'translate-x-[22px]'),
        )}
      />
    </button>
  );

  if (!label && !description && !hint && !error) return control;

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      <div className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 flex-col">
          {label ? (
            <span
              id={`${ids.id}-label`}
              className="text-kt-base font-medium text-fg"
            >
              {label}
            </span>
          ) : null}
          {description ? (
            <span className="text-kt-sm text-fg-subtle">{description}</span>
          ) : null}
        </span>
        {control}
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
});
