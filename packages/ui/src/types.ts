/**
 * Types transverses du design system.
 * Aucun import de `next/*` : la navigation passe par un composant lien injecté.
 */
import type { AnchorHTMLAttributes, ComponentType, ReactNode } from 'react';

/** Props minimales acceptées par un composant lien (compatible `next/link`). */
export interface LinkLikeProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: ReactNode;
}

/**
 * Composant de navigation injectable.
 * Par défaut les composants rendent une balise `<a>` native.
 */
export type LinkComponent = 'a' | ComponentType<LinkLikeProps>;

/** Normalise la prop `linkComponent` en un composant utilisable en JSX. */
export function resolveLinkComponent(
  link?: LinkComponent,
): ComponentType<LinkLikeProps> {
  return (link ?? 'a') as unknown as ComponentType<LinkLikeProps>;
}

/** Tailles génériques partagées par plusieurs primitives. */
export type Size = 'sm' | 'md' | 'lg';
