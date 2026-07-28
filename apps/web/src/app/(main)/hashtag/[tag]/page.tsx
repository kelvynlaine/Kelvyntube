import type { Metadata } from 'next';
import { HashtagPageContent } from '@/components/feed';

/**
 * Page d'un hashtag. Composant serveur : il n'existe que pour produire les
 * métadonnées de référencement, tout l'interactif vit dans
 * `HashtagPageContent` (composant client).
 */

interface HashtagPageProps {
  /** Next 15 : les paramètres de route sont asynchrones. */
  params: Promise<{ tag: string }>;
}

/** Normalise le segment d'URL : sans « # », en minuscules (règle de l'API). */
function normalizeTag(raw: string): string {
  return decodeURIComponent(raw).trim().replace(/^#+/, '').toLowerCase().slice(0, 40);
}

export async function generateMetadata({ params }: HashtagPageProps): Promise<Metadata> {
  const { tag } = await params;
  const name = normalizeTag(tag);

  return {
    // `absolute` : le gabarit global « %s — Kelvyn Tube » ne doit pas s'ajouter.
    title: { absolute: `#${name} — Kelvyn Tube` },
    description: `Découvrez les vidéos Kelvyn Tube associées au hashtag #${name}.`,
    openGraph: {
      title: `#${name} — Kelvyn Tube`,
      description: `Les vidéos les plus populaires et les plus récentes sur #${name}.`,
    },
  };
}

export default async function HashtagPage({ params }: HashtagPageProps) {
  const { tag } = await params;
  return <HashtagPageContent tag={normalizeTag(tag)} />;
}
