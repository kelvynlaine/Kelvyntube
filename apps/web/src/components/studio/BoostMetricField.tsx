'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { formatCompactNumber } from '@kelvyntube/shared';
import { Button, IconButton, Input, Slider, cn } from '@kelvyntube/ui';
import { formatNumber } from './studio-format';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CHAMP DE MÉTRIQUE DU BOOSTER
 *  Un curseur LOGARITHMIQUE couplé à un champ numérique exact.
 *
 *  Pourquoi le logarithme ? Le plafond des vues est de 7 000 000 000 : sur un
 *  rail linéaire, 99 % de la course serait consacrée aux valeurs > 70 M et
 *  choisir « 5 000 vues » demanderait une précision au pixel. On travaille
 *  donc sur une échelle log :
 *
 *      position = RESOLUTION × ln(1 + valeur) / ln(1 + max)
 *      valeur   = exp(position / RESOLUTION × ln(1 + max)) − 1
 *
 *  `log1p` / `expm1` garantissent que 0 → 0 et max → max, sans perte de
 *  précision près de zéro. Le champ numérique reste la voie de la saisie
 *  exacte ; le curseur sert à balayer les ordres de grandeur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nombre de crans du rail : ~2,3 % d'écart entre deux crans à 7 milliards. */
export const SLIDER_RESOLUTION = 1000;

/** Arrondit à 3 chiffres significatifs au-delà de 1 000 (valeurs lisibles). */
function roundSignificant(value: number): number {
  if (value < 1000) return Math.round(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 2);
  return Math.round(value / magnitude) * magnitude;
}

/** Valeur métier → position du curseur (0 … SLIDER_RESOLUTION). */
export function sliderFromValue(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const clamped = Math.min(value, max);
  return Math.round((Math.log1p(clamped) / Math.log1p(max)) * SLIDER_RESOLUTION);
}

/** Position du curseur → valeur métier (arrondie pour rester lisible). */
export function valueFromSlider(position: number, max: number): number {
  if (position <= 0) return 0;
  if (position >= SLIDER_RESOLUTION) return max;
  const raw = Math.expm1((position / SLIDER_RESOLUTION) * Math.log1p(max));
  return Math.min(max, roundSignificant(raw));
}

/** Borne une saisie libre dans [0, max] en entier. */
export function clampMetric(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

export interface BoostMetricFieldProps {
  /** Identifiant stable (préfixe des `id` du curseur et du champ). */
  name: string;
  label: string;
  icon: ReactNode;
  value: number;
  /** Plafond issu de `BOOST_LIMITS`. */
  max: number;
  /** Incréments proposés en boutons (« +1 K », « +1 M »…). */
  shortcuts: number[];
  onChange: (value: number) => void;
  /** Explication permanente affichée sous le champ. */
  hint?: ReactNode;
  /** Message d'erreur de validation. */
  error?: string;
  disabled?: boolean;
  /** Raison visible du blocage (affichée à la place de `hint`). */
  disabledReason?: ReactNode;
}

/**
 * ── CIBLE TACTILE DU CURSEUR ────────────────────────────────────────────────
 * Le `Slider` du design system est un `input[type=range]` de 4 px de haut
 * (`h-1`) : impossible à saisir au doigt. On ne peut pas non plus se contenter
 * d'un conteneur plus grand — la zone sensible d'un `range` est celle de
 * l'élément lui-même.
 *
 * On porte donc l'input à 44 px de haut, on rend son fond transparent, et on
 * redessine explicitement le rail (`::-webkit-slider-runnable-track` /
 * `::-moz-range-track`) et la poignée. Cette redéclaration est obligatoire :
 * `appearance: none` (déjà posé par le composant) efface le rendu natif de la
 * poignée sous WebKit. La poignée passe à 24 px et reste centrée sur un rail
 * de 6 px, la marge négative compensant la différence de hauteur.
 */
const SLIDER_TOUCH_CLASS = [
  'h-11 bg-transparent py-0',
  // Rail
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-pill',
  '[&::-webkit-slider-runnable-track]:bg-bg-active',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-pill [&::-moz-range-track]:bg-bg-active',
  // Poignée (24 px, recentrée : (6 − 24) / 2 = −9 px)
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-[9px]',
  '[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:border-0',
  '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer',
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full',
  '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand [&::-moz-range-thumb]:cursor-pointer',
].join(' ');

/** Curseur log + saisie exacte + raccourcis, pour une métrique du booster. */
export function BoostMetricField({
  name,
  label,
  icon,
  value,
  max,
  shortcuts,
  onChange,
  hint,
  error,
  disabled = false,
  disabledReason,
}: BoostMetricFieldProps) {
  const sliderId = `boost-${name}-slider`;
  const inputId = `boost-${name}-input`;

  // Brouillon de saisie : permet de vider le champ sans qu'il se remplisse
  // aussitôt d'un « 0 » imposé par l'état parent.
  const [draft, setDraft] = useState(() => String(value));
  useEffect(() => {
    setDraft((current) => (clampMetric(Number(current), max) === value ? current : String(value)));
  }, [value, max]);

  const position = sliderFromValue(value, max);
  const compact = formatCompactNumber(value);
  const valueText = `${formatNumber(value)} sur un maximum de ${formatNumber(max)}`;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-kt border border-border bg-bg-elevated p-3 feed-2:p-4',
        disabled && 'opacity-70',
      )}
    >
      <Slider
        id={sliderId}
        label={
          <span className="flex w-full items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-kt-base font-medium text-fg">
              {icon}
              {label}
            </span>
            <span aria-hidden="true" className="tabular-nums text-kt-sm text-fg-muted">
              {compact} / {formatCompactNumber(max)}
            </span>
          </span>
        }
        min={0}
        max={SLIDER_RESOLUTION}
        step={1}
        value={position}
        disabled={disabled}
        className={SLIDER_TOUCH_CLASS}
        onValueChange={(next) => onChange(valueFromSlider(next, max))}
        // Le rail travaille en positions log : on expose la valeur métier réelle
        // aux technologies d'assistance plutôt que le cran interne.
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
      />

      {/*
        Le champ exact prend TOUTE la largeur en mobile : associé aux
        raccourcis sur la même ligne, il se réduisait à ~120 px et la rangée
        « +1 k / +100 k / +1 M / +1 Md » débordait de la carte.
      */}
      <div className="flex flex-col gap-2 xs:flex-row xs:flex-wrap xs:items-center">
        {/* Libellé lié mais masqué : le curseur porte déjà le nom visible. */}
        <label htmlFor={inputId} className="sr-only">
          {`Valeur exacte — ${label}`}
        </label>
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          value={draft}
          disabled={disabled}
          error={error}
          containerClassName="w-full xs:min-w-[9rem] xs:flex-1"
          className="h-11 tabular-nums feed-3:h-10"
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            onChange(raw === '' ? 0 : clampMetric(Number(raw), max));
          }}
          onBlur={() => setDraft(String(value))}
        />

        {/*
          Rangée de raccourcis DÉFILABLE horizontalement en mobile : quatre
          pilules de 44 px ne tiennent pas sur 280 px utiles, et les empiler
          ferait exploser la hauteur de chacune des cinq métriques.
        */}
        <div className="kt-no-scrollbar -mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5 xs:mx-0 xs:flex-wrap xs:overflow-visible xs:px-0 xs:pb-0">
          {shortcuts.map((step) => (
            <Button
              key={step}
              size="sm"
              variant="outline"
              className="h-11 shrink-0 text-kt-base feed-3:h-8 feed-3:text-kt-sm"
              disabled={disabled || value >= max}
              onClick={() => onChange(clampMetric(value + step, max))}
              aria-label={`Ajouter ${formatNumber(step)} à ${label}`}
            >
              {`+${formatCompactNumber(step)}`}
            </Button>
          ))}
          <IconButton
            size="sm"
            aria-label={`Remettre ${label} à zéro`}
            tooltip="Remettre à zéro"
            className="size-11 feed-3:size-8"
            disabled={disabled || value === 0}
            onClick={() => onChange(0)}
          >
            <RotateCcw size={16} />
          </IconButton>
        </div>
      </div>

      {disabled && disabledReason ? (
        <p className="text-kt-sm text-warning">{disabledReason}</p>
      ) : (
        <p className="text-kt-sm text-fg-subtle">
          <span className="tabular-nums text-fg-muted">{formatNumber(value)}</span>
          {value > 0 ? <span className="text-fg-subtle">{` (${compact})`}</span> : null}
          {hint ? <span className="block">{hint}</span> : null}
        </p>
      )}
    </div>
  );
}
