'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import type { CategoryDTO } from '@kelvyntube/shared';
import { cn } from '@kelvyntube/ui';
import {
  Car,
  ChefHat,
  Clapperboard,
  Compass,
  Cpu,
  Dumbbell,
  Gamepad2,
  GraduationCap,
  Laugh,
  Music,
  Newspaper,
  Plane,
  Video,
  type LucideProps,
} from 'lucide-react';
import { PATHS } from '@/lib/nav';

/** Correspondance `CategoryDTO.icon` (kebab-case) → icône `lucide-react`. */
const CATEGORY_ICONS: Record<string, ComponentType<LucideProps>> = {
  music: Music,
  'gamepad-2': Gamepad2,
  cpu: Cpu,
  dumbbell: Dumbbell,
  video: Video,
  'graduation-cap': GraduationCap,
  newspaper: Newspaper,
  'chef-hat': ChefHat,
  laugh: Laugh,
  plane: Plane,
  clapperboard: Clapperboard,
  car: Car,
};

/**
 * Dégradés distincts par catégorie, construits uniquement à partir des tokens
 * du preset Tailwind (aucune couleur en dur).
 */
const GRADIENTS = [
  'from-brand/40 via-brand/10 to-bg-elevated',
  'from-accent/60 via-accent/20 to-bg-elevated',
  'from-success/40 via-success/10 to-bg-elevated',
  'from-warning/40 via-warning/10 to-bg-elevated',
  'from-danger/40 via-danger/10 to-bg-elevated',
  'from-fg/25 via-fg/5 to-bg-elevated',
] as const;

export interface CategoryCardProps {
  category: CategoryDTO;
  /** Position dans la grille : détermine le dégradé. */
  index: number;
  className?: string;
}

/** Carte de catégorie de la page « Explorer ». */
export function CategoryCard({ category, index, className }: CategoryCardProps) {
  const Icon = (category.icon && CATEGORY_ICONS[category.icon]) || Compass;
  const gradient = GRADIENTS[index % GRADIENTS.length];

  return (
    <Link
      href={PATHS.category(category.slug)}
      className={cn(
        'group/category relative flex h-28 flex-col justify-end overflow-hidden rounded-kt-lg border border-border p-4',
        'bg-gradient-to-br transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none kt-focus-ring',
        gradient,
        className,
      )}
    >
      <Icon
        size={64}
        aria-hidden="true"
        className="absolute -right-2 -top-2 text-fg opacity-20 transition-opacity group-hover/category:opacity-30"
      />
      <span className="text-kt-md font-medium text-fg">{category.name}</span>
    </Link>
  );
}
