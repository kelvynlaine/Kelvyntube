'use client';

import { useEffect, useState } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  COULEURS DES GRAPHIQUES
 *  Recharts a besoin de couleurs concrètes (attributs SVG `fill`/`stroke`) :
 *  on lit donc les variables CSS du preset au moment du rendu client, et on
 *  les relit quand `data-theme` change — les courbes restent lisibles dans
 *  les deux thèmes sans dupliquer la palette.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ChartTheme {
  /** Couleur principale des séries (accent lisible sur les deux fonds). */
  accent: string;
  brand: string;
  success: string;
  warning: string;
  danger: string;
  /** Lignes de grille très discrètes. */
  grid: string;
  /** Graduations et libellés d'axes. */
  axis: string;
  fg: string;
  fgMuted: string;
  surface: string;
  border: string;
  /** Palette catégorielle (sources de trafic, appareils…). */
  series: string[];
}

/** Couleurs de repli utilisées pendant le premier rendu (thème sombre). */
const FALLBACK: ChartTheme = {
  accent: 'rgb(62 166 255)',
  brand: '#ff0033',
  success: '#2ba640',
  warning: '#ffa000',
  danger: '#f03e3e',
  grid: 'rgb(48 48 48)',
  axis: 'rgb(129 129 129)',
  fg: 'rgb(241 241 241)',
  fgMuted: 'rgb(170 170 170)',
  surface: 'rgb(33 33 33)',
  border: 'rgb(48 48 48)',
  series: ['rgb(62 166 255)', '#ff0033', '#2ba640', '#ffa000', '#a78bfa', '#f03e3e'],
};

/** `--kt-accent-fg: 62 166 255` -> `rgb(62 166 255)`. */
function readColor(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = styles.getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : fallback;
}

function computeTheme(): ChartTheme {
  if (typeof window === 'undefined') return FALLBACK;
  const styles = window.getComputedStyle(document.documentElement);
  const accent = readColor(styles, '--kt-accent-fg', FALLBACK.accent);
  return {
    accent,
    brand: FALLBACK.brand,
    success: FALLBACK.success,
    warning: FALLBACK.warning,
    danger: FALLBACK.danger,
    grid: readColor(styles, '--kt-border', FALLBACK.grid),
    axis: readColor(styles, '--kt-fg-subtle', FALLBACK.axis),
    fg: readColor(styles, '--kt-fg', FALLBACK.fg),
    fgMuted: readColor(styles, '--kt-fg-muted', FALLBACK.fgMuted),
    surface: readColor(styles, '--kt-bg-elevated', FALLBACK.surface),
    border: readColor(styles, '--kt-border', FALLBACK.border),
    series: [
      accent,
      FALLBACK.brand,
      FALLBACK.success,
      FALLBACK.warning,
      '#a78bfa',
      FALLBACK.danger,
    ],
  };
}

/** Palette de graphiques synchronisée avec le thème courant. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    setTheme(computeTheme());

    // `next-themes` bascule l'attribut `data-theme` sur <html>.
    const observer = new MutationObserver(() => setTheme(computeTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
