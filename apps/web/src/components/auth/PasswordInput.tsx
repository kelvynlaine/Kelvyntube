'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';
import { Input, type InputProps } from '@kelvyntube/ui';

export type PasswordInputProps = Omit<InputProps, 'type' | 'iconRight'>;

/**
 * Champ mot de passe avec bascule d'affichage.
 * Le bouton est un vrai `<button>` en dehors du flux de saisie : il reste
 * atteignable au clavier juste après le champ.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ id, ...rest }, ref) {
    const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const fieldId = id ?? `kt-pwd-${autoId}`;
    const [visible, setVisible] = useState(false);

    return (
      <Input
        {...rest}
        ref={ref}
        id={fieldId}
        type={visible ? 'text' : 'password'}
        iconRight={
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={visible}
            aria-controls={fieldId}
            className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg kt-focus-ring"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
      />
    );
  },
);
