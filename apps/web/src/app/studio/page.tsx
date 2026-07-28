import { StudioRedirect } from '@/components/studio/StudioRedirect';

/**
 * `/studio` — point d'entrée sans identifiant : redirige vers le Studio de
 * la chaîne active de l'utilisateur.
 */
export default function StudioIndexPage() {
  return <StudioRedirect />;
}
