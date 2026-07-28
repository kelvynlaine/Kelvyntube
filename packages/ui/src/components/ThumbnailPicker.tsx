'use client';

import { ImagePlus } from 'lucide-react';
import { useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { cn } from '../cn';
import { useFieldIds } from './Field';
import { ProgressBar } from './ProgressBar';

export interface ThumbnailPickerProps {
  /** Miniatures générées automatiquement (3 en général). */
  options: string[];
  /** URL actuellement sélectionnée. */
  value?: string | null;
  onChange?: (url: string) => void;
  /** Miniature personnalisée déjà téléversée. */
  customUrl?: string | null;
  /** Fichier choisi par l'utilisateur (l'upload est géré par la page). */
  onCustomFile?: (file: File) => void;
  uploading?: boolean;
  /** Progression de l'upload personnalisé (0-100). */
  progress?: number;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  accept?: string;
  className?: string;
}

/** Choix de miniature : propositions automatiques + upload personnalisé. */
export function ThumbnailPicker({
  options,
  value,
  onChange,
  customUrl,
  onCustomFile,
  uploading = false,
  progress,
  label = 'Miniature',
  hint = 'Sélectionnez une image ou importez la vôtre (1280×720 recommandé).',
  error,
  disabled = false,
  accept = 'image/jpeg,image/png,image/webp',
  className,
}: ThumbnailPickerProps) {
  const ids = useFieldIds(undefined, hint, error);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const all = customUrl ? [...options, customUrl] : options;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onCustomFile?.(file);
    event.target.value = '';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (all.length === 0) return;
    const currentIndex = all.findIndex((url) => url === value);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (currentIndex + 1 + all.length) % all.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (currentIndex - 1 + all.length) % all.length;
    if (next === null) return;
    event.preventDefault();
    onChange?.(all[next]);
    buttonsRef.current[next]?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={`${ids.id}-label`} className="text-kt-sm font-medium text-fg-muted">
        {label}
      </span>

      <div
        role="radiogroup"
        aria-labelledby={`${ids.id}-label`}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-3 xs:grid-cols-4"
      >
        {all.map((url, index) => {
          const selected = url === value;
          const isCustom = Boolean(customUrl) && url === customUrl;
          return (
            <button
              key={url}
              ref={(el) => {
                buttonsRef.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={
                isCustom
                  ? 'Miniature personnalisée'
                  : `Miniature générée ${index + 1}`
              }
              tabIndex={selected || (!value && index === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange?.(url)}
              className={cn(
                'relative aspect-video overflow-hidden rounded-kt border-2 bg-bg-elevated transition-colors kt-focus-ring',
                selected ? 'border-accent-fg' : 'border-transparent hover:border-border-strong',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
              {isCustom ? (
                <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 text-kt-xs text-white">
                  Perso
                </span>
              ) : null}
            </button>
          );
        })}

        {/* Case d'upload personnalisé */}
        {onCustomFile ? (
          <>
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex aspect-video flex-col items-center justify-center gap-1 rounded-kt',
                'border-2 border-dashed border-border text-fg-muted transition-colors',
                'hover:border-border-strong hover:text-fg kt-focus-ring',
                (disabled || uploading) && 'cursor-not-allowed opacity-50',
              )}
            >
              <ImagePlus size={22} aria-hidden="true" />
              <span className="text-kt-sm">Importer</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              onChange={handleFile}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </>
        ) : null}
      </div>

      {uploading ? (
        <ProgressBar
          value={progress ?? 0}
          indeterminate={progress === undefined}
          ariaLabel="Import de la miniature"
          size="sm"
        />
      ) : null}

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
