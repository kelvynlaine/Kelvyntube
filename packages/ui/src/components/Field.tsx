'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '../cn';

/** Props communes à tous les champs de formulaire du design system. */
export interface FieldBaseProps {
  label?: ReactNode;
  /** Message d'aide sous le champ. */
  hint?: ReactNode;
  /** Message d'erreur — active `aria-invalid`. */
  error?: ReactNode;
  /** Classe du conteneur (label + champ + messages). */
  containerClassName?: string;
}

export interface FieldIds {
  id: string;
  hintId: string;
  errorId: string;
  /** Valeur prête pour `aria-describedby` (undefined si aucun message). */
  describedBy: string | undefined;
}

/** Génère et relie les identifiants d'un champ (label / hint / error). */
export function useFieldIds(
  explicitId?: string,
  hint?: ReactNode,
  error?: ReactNode,
): FieldIds {
  const auto = useId();
  // `useId` produit des caractères non alphanumériques selon la version de React
  const id = explicitId ?? `kt-${auto.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  return { id, hintId, errorId, describedBy };
}

export interface FieldProps extends FieldBaseProps {
  ids: FieldIds;
  /** `label` pour un champ unique, `span` pour un groupe (radio, switch…). */
  labelAs?: 'label' | 'span';
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Enveloppe visuelle d'un champ : libellé, contrôle, aide et erreur. */
export function Field({
  ids,
  label,
  hint,
  error,
  labelAs = 'label',
  required = false,
  containerClassName,
  className,
  children,
}: FieldProps) {
  const LabelTag = labelAs;
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName, className)}>
      {label ? (
        <LabelTag
          {...(labelAs === 'label' ? { htmlFor: ids.id } : {})}
          className="text-kt-sm font-medium text-fg-muted"
        >
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-brand">
              *
            </span>
          )}
        </LabelTag>
      ) : null}

      {children}

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
}

/** Classes partagées par les contrôles saisissables (input, textarea, select). */
export const FIELD_CONTROL_CLASS =
  'w-full rounded-kt border border-border bg-bg px-3 text-kt-base text-fg ' +
  'placeholder:text-fg-subtle transition-colors ' +
  'hover:border-border-strong ' +
  'focus:border-accent-fg focus:outline-none focus:ring-1 focus:ring-accent-fg ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const FIELD_ERROR_CLASS =
  'border-danger focus:border-danger focus:ring-danger';
