'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../cn';
import { Chip } from './Chip';

export interface FilterChip {
  slug: string;
  label: string;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  /** Slug actif. */
  activeSlug?: string;
  onSelect?: (slug: string) => void;
  /** `aria-label` de la rangée. */
  label?: string;
  className?: string;
}

/** Rangée de filtres horizontale avec flèches de défilement contextuelles. */
export function FilterChips({
  chips,
  activeSlug,
  onSelect,
  label = 'Filtres',
  className,
}: FilterChipsProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();

    el.addEventListener('scroll', updateArrows, { passive: true });
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateArrows)
        : null;
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', updateArrows);
      observer?.disconnect();
    };
  }, [updateArrows, chips.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className={cn('relative', className)}>
      {canScrollLeft ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent"
          />
          <button
            type="button"
            aria-label="Faire défiler vers la gauche"
            onClick={() => scrollBy(-1)}
            // `kt-coarse-hidden` : au doigt on fait glisser la rangée
            // directement. Une flèche de 32 px posée par-dessus les chips leur
            // volerait leur zone tactile sans rien apporter — elle ne sert
            // qu'au pointeur fin, qui ne sait pas « swiper ».
            className="absolute left-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center rounded-full bg-bg p-1.5 text-fg shadow-md transition-colors hover:bg-bg-hover kt-coarse-hidden kt-focus-ring"
          >
            <ChevronLeft size={20} />
          </button>
        </>
      ) : null}

      <div
        ref={scrollerRef}
        role="group"
        aria-label={label}
        // `overscroll-x-contain` : arrivé en bout de rangée, le balayage ne
        // déclenche pas le geste « retour » du navigateur mobile.
        className="kt-no-scrollbar flex items-center gap-2 overflow-x-auto overscroll-x-contain scroll-smooth py-1 xs:gap-3"
      >
        {chips.map((chip) => (
          <Chip
            key={chip.slug}
            active={chip.slug === activeSlug}
            onClick={() => onSelect?.(chip.slug)}
          >
            {chip.label}
          </Chip>
        ))}
      </div>

      {canScrollRight ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent"
          />
          <button
            type="button"
            aria-label="Faire défiler vers la droite"
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center rounded-full bg-bg p-1.5 text-fg shadow-md transition-colors hover:bg-bg-hover kt-coarse-hidden kt-focus-ring"
          >
            <ChevronRight size={20} />
          </button>
        </>
      ) : null}
    </div>
  );
}
