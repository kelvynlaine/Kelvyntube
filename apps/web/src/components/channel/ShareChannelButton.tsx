'use client';

import { Check, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

export interface ShareChannelButtonProps {
  handle: string;
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

/**
 * Copie l'URL publique de la chaîne dans le presse-papiers.
 * Le retour est annoncé en `aria-live` plutôt qu'en toast : ce composant est
 * monté dans le layout `(main)`, dont on ne maîtrise pas le `ToastProvider`.
 */
export function ShareChannelButton({
  handle,
  label = 'Partager',
  variant = 'secondary',
  size = 'md',
  className,
}: ShareChannelButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const share = useCallback(async () => {
    const url = `${window.location.origin}${PATHS.channel(handle)}`;
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), 3000);
  }, [handle]);

  return (
    <span className={className}>
      <Button
        variant={variant}
        size={size}
        onClick={() => void share()}
        iconLeft={state === 'copied' ? <Check size={18} /> : <Share2 size={18} />}
      >
        {state === 'copied' ? 'Lien copié' : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Lien de la chaîne copié dans le presse-papiers.' : ''}
        {state === 'failed' ? 'Copie impossible, copie le lien depuis la barre d’adresse.' : ''}
      </span>
    </span>
  );
}
