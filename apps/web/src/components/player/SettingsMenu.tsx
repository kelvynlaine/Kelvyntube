'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CaptionDTO } from '@kelvyntube/shared';
import { PLAYBACK_RATES } from '@/lib/player-storage';
import type { PlayerLevel } from '@/hooks/useHlsPlayer';

type MenuView = 'main' | 'quality' | 'speed' | 'captions';

export interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
  /** Bouton qui ouvre le menu : ignoré par la fermeture au clic extérieur. */
  anchorRef?: RefObject<HTMLElement | null>;
  levels: PlayerLevel[];
  /** Niveau demandé (`-1` = auto). */
  currentLevel: number;
  /** Hauteur réellement jouée, affichée entre parenthèses en mode auto. */
  activeHeight: number | null;
  onLevelChange: (index: number) => void;
  playbackRate: number;
  onRateChange: (rate: number) => void;
  captions: CaptionDTO[];
  /** Langue active ; `null` = sous-titres désactivés. */
  activeCaptionLang: string | null;
  onCaptionChange: (language: string | null) => void;
  className?: string;
}

/** « 1.5 » → « 1,5× » ; 1 → « Normale ». */
function formatRate(rate: number): string {
  if (rate === 1) return 'Normale';
  return `${rate.toString().replace('.', ',')}×`;
}

function captionLabel(caption: CaptionDTO): string {
  return caption.auto ? `${caption.label} (auto)` : caption.label;
}

/**
 * Menu réglages façon YouTube : un panneau racine et des sous-menus qui
 * glissent (Qualité, Vitesse, Sous-titres). Navigation clavier complète,
 * fermeture au clic extérieur et à Échap.
 */
export function SettingsMenu({
  open,
  onClose,
  anchorRef,
  levels,
  currentLevel,
  activeHeight,
  onLevelChange,
  playbackRate,
  onRateChange,
  captions,
  activeCaptionLang,
  onCaptionChange,
  className,
}: SettingsMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<MenuView>('main');

  // Retour au menu racine à chaque ouverture.
  useEffect(() => {
    if (open) setView('main');
  }, [open]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchorRef, onClose, open]);

  // Focus du premier élément à l'ouverture et à chaque changement de vue.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>('[data-menu-item]');
    first?.focus();
  }, [open, view]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (view !== 'main') setView('main');
        else onClose();
        return;
      }

      if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && view !== 'main') {
        event.preventDefault();
        event.stopPropagation();
        setView('main');
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('[data-menu-item]'));
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === 'Tab') {
        // Piège le focus dans le panneau.
        event.preventDefault();
        const next = event.shiftKey
          ? (index - 1 + items.length) % items.length
          : (index + 1) % items.length;
        items[next].focus();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = index < 0 ? 0 : (index + delta + items.length) % items.length;
      items[next].focus();
    },
    [onClose, view],
  );

  if (!open) return null;

  const currentLevelLabel =
    currentLevel === -1
      ? activeHeight
        ? `Auto (${activeHeight}p)`
        : 'Auto'
      : (levels.find((l) => l.index === currentLevel)?.label ?? 'Auto');

  const currentCaptionLabel =
    activeCaptionLang === null
      ? 'Désactivés'
      : (captions.find((c) => c.language === activeCaptionLang)?.label ?? 'Désactivés');

  const itemClass =
    'flex w-full items-center justify-between gap-6 rounded-[6px] px-3 py-[9px] text-left text-kt-base text-white transition-colors hover:bg-white/15 kt-focus-ring';

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Réglages du lecteur"
      onKeyDown={handleKeyDown}
      className={clsx(
        'absolute bottom-full right-0 z-30 mb-2 min-w-[220px] max-w-[min(320px,90vw)] overflow-hidden',
        'rounded-kt bg-black/95 p-1 text-white shadow-lg ring-1 ring-white/10 backdrop-blur',
        'animate-fade-in motion-reduce:animate-none',
        className,
      )}
    >
      {view === 'main' ? (
        <div className="flex flex-col">
          <button
            type="button"
            role="menuitem"
            data-menu-item
            className={itemClass}
            onClick={() => setView('quality')}
          >
            <span>Qualité</span>
            <span className="flex items-center gap-1 text-white/70">
              {currentLevelLabel}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-menu-item
            className={itemClass}
            onClick={() => setView('speed')}
          >
            <span>Vitesse de lecture</span>
            <span className="flex items-center gap-1 text-white/70">
              {formatRate(playbackRate)}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-menu-item
            className={itemClass}
            onClick={() => setView('captions')}
            disabled={captions.length === 0}
          >
            <span className={captions.length === 0 ? 'text-white/40' : undefined}>Sous-titres</span>
            <span className="flex items-center gap-1 text-white/70">
              {captions.length === 0 ? 'Indisponibles' : currentCaptionLabel}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        </div>
      ) : (
        <div className="animate-slide-up motion-reduce:animate-none">
          <button
            type="button"
            data-menu-item
            onClick={() => setView('main')}
            className="mb-1 flex w-full items-center gap-2 border-b border-white/10 px-2 py-[9px] text-left text-kt-base font-medium text-white kt-focus-ring"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {view === 'quality' ? 'Qualité' : view === 'speed' ? 'Vitesse de lecture' : 'Sous-titres'}
          </button>

          <div
            className="kt-scroll flex max-h-[240px] flex-col overflow-y-auto"
            role="group"
            aria-label={
              view === 'quality' ? 'Qualité' : view === 'speed' ? 'Vitesse' : 'Sous-titres'
            }
          >
            {view === 'quality' ? (
              <>
                <MenuRadioItem
                  label={activeHeight ? `Auto (${activeHeight}p)` : 'Auto'}
                  checked={currentLevel === -1}
                  onSelect={() => onLevelChange(-1)}
                />
                {levels.map((level) => (
                  <MenuRadioItem
                    key={level.index}
                    label={level.label}
                    checked={currentLevel === level.index}
                    onSelect={() => onLevelChange(level.index)}
                  />
                ))}
                {levels.length === 0 ? (
                  <p className="px-3 py-2 text-kt-sm text-white/60">
                    Source unique : qualité non ajustable.
                  </p>
                ) : null}
              </>
            ) : null}

            {view === 'speed'
              ? PLAYBACK_RATES.map((rate) => (
                  <MenuRadioItem
                    key={rate}
                    label={formatRate(rate)}
                    checked={Math.abs(playbackRate - rate) < 0.001}
                    onSelect={() => onRateChange(rate)}
                  />
                ))
              : null}

            {view === 'captions' ? (
              <>
                <MenuRadioItem
                  label="Désactivés"
                  checked={activeCaptionLang === null}
                  onSelect={() => onCaptionChange(null)}
                />
                {captions.map((caption) => (
                  <MenuRadioItem
                    key={caption.language}
                    label={captionLabel(caption)}
                    checked={activeCaptionLang === caption.language}
                    onSelect={() => onCaptionChange(caption.language)}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuRadioItemProps {
  label: string;
  checked: boolean;
  onSelect: () => void;
}

function MenuRadioItem({ label, checked, onSelect }: MenuRadioItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      data-menu-item
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[6px] px-3 py-[9px] text-left text-kt-base text-white transition-colors hover:bg-white/15 kt-focus-ring"
    >
      <Check
        className={clsx('h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

export default SettingsMenu;
