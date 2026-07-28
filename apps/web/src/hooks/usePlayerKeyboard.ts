'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Nature du retour visuel affiché au centre du lecteur. */
export type PlayerFeedbackKind =
  | 'play'
  | 'pause'
  | 'forward'
  | 'backward'
  | 'volume'
  | 'mute'
  | 'unmute'
  | 'speed'
  | 'frame'
  | 'captions'
  | 'captions-off'
  | 'fullscreen'
  | 'theater'
  | 'pip';

export interface PlayerFeedback {
  /** Identifiant incrémental : force le redémarrage de l'animation. */
  id: number;
  kind: PlayerFeedbackKind;
  /** Texte court affiché sous l'icône (« 10 s », « 75 % », « 1,5× »). */
  label?: string;
}

/** Actions que le lecteur expose aux raccourcis clavier. */
export interface PlayerKeyboardActions {
  togglePlay: () => void;
  /** Déplacement relatif en secondes (négatif = retour arrière). */
  seekBy: (seconds: number) => void;
  /** Saut à un pourcentage de la durée (0 → 1). */
  seekToRatio: (ratio: number) => void;
  /** Ajustement relatif du volume (−1 → 1). */
  adjustVolume: (delta: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  toggleTheater?: () => void;
  togglePip?: () => void;
  toggleCaptions?: () => void;
  /** Avance/recul image par image (uniquement en pause). */
  stepFrame: (direction: 1 | -1) => void;
  /** Vitesse suivante / précédente dans la liste. */
  stepRate: (direction: 1 | -1) => void;
}

export interface UsePlayerKeyboardOptions {
  /** Conteneur du lecteur : les touches ne sont actives que s'il a le focus. */
  containerRef: RefObject<HTMLElement | null>;
  actions: PlayerKeyboardActions;
  enabled?: boolean;
}

export interface UsePlayerKeyboardResult {
  /** Retour visuel courant (`null` quand il a expiré). */
  feedback: PlayerFeedback | null;
  /** Permet au lecteur d'afficher le même retour depuis un clic / un tap. */
  showFeedback: (kind: PlayerFeedbackKind, label?: string) => void;
}

/** Durée d'affichage du retour visuel (ms). */
const FEEDBACK_MS = 700;

/** Vrai si la cible du clavier est un champ de saisie. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/**
 * Raccourcis clavier façon YouTube. Actifs uniquement lorsque le focus se
 * trouve dans le lecteur, jamais dans un champ de saisie.
 */
export function usePlayerKeyboard({
  containerRef,
  actions,
  enabled = true,
}: UsePlayerKeyboardOptions): UsePlayerKeyboardResult {
  const [feedback, setFeedback] = useState<PlayerFeedback | null>(null);
  const feedbackIdRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const showFeedback = useCallback((kind: PlayerFeedbackKind, label?: string) => {
    feedbackIdRef.current += 1;
    setFeedback({ id: feedbackIdRef.current, kind, label });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Les curseurs (barre de progression, volume) gèrent leurs propres flèches.
      const onSlider =
        event.target instanceof HTMLElement && event.target.closest('[role="slider"]') !== null;

      const a = actionsRef.current;
      const key = event.key;

      // Chiffres 0-9 : saut à 0-90 % de la durée.
      if (/^[0-9]$/.test(key)) {
        const ratio = Number(key) / 10;
        a.seekToRatio(ratio);
        showFeedback('forward', `${Number(key) * 10} %`);
        event.preventDefault();
        return;
      }

      switch (key) {
        case ' ':
        case 'Spacebar': // anciens navigateurs
        case 'k':
        case 'K':
          a.togglePlay();
          event.preventDefault();
          break;

        case 'ArrowLeft':
          if (onSlider) return;
          a.seekBy(-5);
          showFeedback('backward', '5 s');
          event.preventDefault();
          break;
        case 'ArrowRight':
          if (onSlider) return;
          a.seekBy(5);
          showFeedback('forward', '5 s');
          event.preventDefault();
          break;

        case 'j':
        case 'J':
          a.seekBy(-10);
          showFeedback('backward', '10 s');
          event.preventDefault();
          break;
        case 'l':
        case 'L':
          a.seekBy(10);
          showFeedback('forward', '10 s');
          event.preventDefault();
          break;

        case 'ArrowUp':
          if (onSlider) return;
          a.adjustVolume(0.05);
          event.preventDefault();
          break;
        case 'ArrowDown':
          if (onSlider) return;
          a.adjustVolume(-0.05);
          event.preventDefault();
          break;

        case 'm':
        case 'M':
          a.toggleMute();
          event.preventDefault();
          break;

        case 'f':
        case 'F':
          a.toggleFullscreen();
          event.preventDefault();
          break;

        case 't':
        case 'T':
          if (!a.toggleTheater) return;
          a.toggleTheater();
          showFeedback('theater');
          event.preventDefault();
          break;

        case 'i':
        case 'I':
          if (!a.togglePip) return;
          a.togglePip();
          showFeedback('pip');
          event.preventDefault();
          break;

        case 'c':
        case 'C':
          if (!a.toggleCaptions) return;
          a.toggleCaptions();
          event.preventDefault();
          break;

        case ',':
          a.stepFrame(-1);
          event.preventDefault();
          break;
        case '.':
          a.stepFrame(1);
          event.preventDefault();
          break;

        case '<':
          a.stepRate(-1);
          event.preventDefault();
          break;
        case '>':
          a.stepRate(1);
          event.preventDefault();
          break;

        case 'Home':
          a.seekToRatio(0);
          event.preventDefault();
          break;
        case 'End':
          a.seekToRatio(1);
          event.preventDefault();
          break;

        default:
          break;
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [containerRef, enabled, showFeedback]);

  return { feedback, showFeedback };
}
