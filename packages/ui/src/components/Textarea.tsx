'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../cn';
import {
  Field,
  FIELD_CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  useFieldIds,
  type FieldBaseProps,
} from './Field';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldBaseProps {
  /** Ajuste automatiquement la hauteur au contenu (actif par défaut). */
  autoResize?: boolean;
  /** Nombre de lignes maximum avant l'apparition du scroll. */
  maxRows?: number;
  /** Affiche un compteur `valeur / maxLength`. */
  showCount?: boolean;
}

/** Zone de texte multi-lignes avec redimensionnement automatique. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      hint,
      error,
      containerClassName,
      autoResize = true,
      maxRows = 12,
      showCount = false,
      id,
      className,
      required,
      rows = 2,
      value,
      defaultValue,
      maxLength,
      onChange,
      ...rest
    },
    ref,
  ) {
    const ids = useFieldIds(id, hint, error);
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el || !autoResize) return;
      el.style.height = 'auto';
      const lineHeight =
        parseFloat(window.getComputedStyle(el).lineHeight || '20') || 20;
      const max = lineHeight * maxRows;
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
      el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
    }, [autoResize, maxRows]);

    // Recalcule à chaque changement de valeur (contrôlé comme non contrôlé)
    useEffect(() => {
      resize();
    }, [resize, value]);

    const length = typeof value === 'string' ? value.length : undefined;

    return (
      <Field
        ids={ids}
        label={label}
        hint={hint}
        error={error}
        required={required}
        containerClassName={containerClassName}
      >
        <textarea
          ref={innerRef}
          id={ids.id}
          rows={rows}
          required={required}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          onChange={(event) => {
            onChange?.(event);
            resize();
          }}
          className={cn(
            FIELD_CONTROL_CLASS,
            'kt-scroll py-2 leading-5',
            autoResize ? 'resize-none' : 'resize-y',
            error && FIELD_ERROR_CLASS,
            className,
          )}
          {...rest}
        />
        {showCount && maxLength ? (
          <span className="self-end text-kt-xs tabular-nums text-fg-subtle">
            {length ?? 0} / {maxLength}
          </span>
        ) : null}
      </Field>
    );
  },
);
