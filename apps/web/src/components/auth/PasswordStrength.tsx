'use client';

import { Check, X } from 'lucide-react';
import { useMemo } from 'react';
import { ProgressBar } from '@kelvyntube/ui';

/**
 * Indicateur de robustesse en direct.
 * Les règles reflètent exactement `passwordSchema` de `@kelvyntube/shared`
 * (min. 8 caractères, une minuscule, une majuscule, un chiffre).
 */
const RULES: { id: string; label: string; test: (value: string) => boolean }[] = [
  { id: 'length', label: 'Au moins 8 caractères', test: (v) => v.length >= 8 },
  { id: 'lower', label: 'Au moins une minuscule', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'Au moins une majuscule', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'Au moins un chiffre', test: (v) => /[0-9]/.test(v) },
];

const LEVELS = ['Trop faible', 'Faible', 'Moyen', 'Bon', 'Solide'] as const;

export interface PasswordStrengthProps {
  value: string;
  /** Identifiant référencé par `aria-describedby` du champ mot de passe. */
  id?: string;
}

export function PasswordStrength({ value, id }: PasswordStrengthProps) {
  const results = useMemo(
    () => RULES.map((rule) => ({ ...rule, passed: rule.test(value) })),
    [value],
  );
  const passed = results.filter((rule) => rule.passed).length;
  const level = LEVELS[value.length === 0 ? 0 : passed];

  return (
    <div id={id} className="flex flex-col gap-2">
      <ProgressBar
        value={passed}
        max={RULES.length}
        size="sm"
        variant={passed === RULES.length ? 'success' : 'brand'}
        ariaLabel={`Robustesse du mot de passe : ${level}`}
      />
      {/* `aria-live` : le lecteur d'écran suit l'évolution sans relire la liste */}
      <p role="status" aria-live="polite" className="text-kt-sm text-fg-muted">
        Robustesse : {level}
      </p>
      <ul className="flex flex-col gap-1">
        {results.map((rule) => (
          <li
            key={rule.id}
            className={
              rule.passed
                ? 'flex items-center gap-2 text-kt-sm text-success'
                : 'flex items-center gap-2 text-kt-sm text-fg-subtle'
            }
          >
            {rule.passed ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <X size={14} aria-hidden="true" />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">{rule.passed ? '— validé' : '— non validé'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
