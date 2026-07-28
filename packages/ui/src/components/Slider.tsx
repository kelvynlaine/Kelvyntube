'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';
import { Field, useFieldIds, type FieldBaseProps } from './Field';

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>,
    FieldBaseProps {
  /** Callback simplifié recevant directement la valeur numérique. */
  onValueChange?: (value: number) => void;
  /** Affiche la valeur courante à droite du libellé. */
  showValue?: boolean;
  /** Formatage de la valeur affichée. */
  formatValue?: (value: number) => string;
}

/** Curseur de réglage (volume, qualité, vitesse de lecture…). */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    label,
    hint,
    error,
    containerClassName,
    onValueChange,
    onChange,
    showValue = false,
    formatValue,
    min = 0,
    max = 100,
    step = 1,
    value,
    id,
    className,
    disabled,
    ...rest
  },
  ref,
) {
  const ids = useFieldIds(id, hint, error);
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  const display = formatValue ? formatValue(numeric) : String(numeric);

  return (
    <Field
      ids={ids}
      label={
        label && showValue ? (
          <span className="flex items-center justify-between gap-2">
            <span>{label}</span>
            <span className="tabular-nums text-fg">{display}</span>
          </span>
        ) : (
          label
        )
      }
      hint={hint}
      error={error}
      containerClassName={containerClassName}
    >
      <input
        ref={ref}
        id={ids.id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(Number(event.target.value));
        }}
        className={cn(
          'h-1 w-full cursor-pointer appearance-none rounded-pill bg-bg-active accent-brand',
          'kt-focus-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    </Field>
  );
});
