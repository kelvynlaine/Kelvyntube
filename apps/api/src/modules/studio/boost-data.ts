/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BOOSTER D'ENGAGEMENT — POOLS DE DONNÉES SYNTHÉTIQUES
 *
 *  Contenu statique utilisé par `boost.service.ts` pour fabriquer des comptes
 *  robots (`User.isBot`) et des commentaires crédibles SUR L'INSTANCE LOCALE.
 *  Aucun de ces textes ne prétend venir d'un vrai spectateur : ils servent à
 *  peupler le Studio pour le développement et les démonstrations.
 *
 *  Règles de rédaction du pool de commentaires :
 *   - français, ton varié (enthousiasme, question, remarque technique, emoji) ;
 *   - jamais d'insulte, jamais de spam publicitaire, jamais de promesse
 *     commerciale ni de lien sortant ;
 *   - aucun texte ne cible une personne réelle.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Pseudos crédibles (FR) piochés pour `User.displayName` des comptes robots. */
export const BOT_DISPLAY_NAMES: readonly string[] = [
  'Camille Rousseau', 'Théo Vasseur', 'Léna Marchand', 'Hugo Delaunay',
  'Inès Barbier', 'Maxime Cordier', 'Jade Lemoine', 'Nathan Perrin',
  'Louise Fabre', 'Adrien Chevalier', 'Manon Leclerc', 'Rayan Bouchard',
  'Clara Deschamps', 'Yanis Moreau', 'Elsa Guerin', 'Tom Lefèvre',
  'Sarah Benali', 'Lucas Aubert', 'Chloé Petit', 'Enzo Renard',
  'Anaïs Bertrand', 'Gabriel Noel', 'Emma Dubois', 'Sofiane Mercier',
  'Zoé Colin', 'Antoine Girard', 'Lina Sanchez', 'Baptiste Roy',
  'Alice Bonnet', 'Malik Traoré', 'Juliette Faure', 'Noah Lambert',
  'Éva Poirier', 'Kevin Masson', 'Romane Gauthier', 'Ilyes Hamdi',
  'Margaux Blanchard', 'Simon Carpentier', 'Nora Chevallier', 'Paul Etienne',
  'Amélie Tessier', 'Dylan Prévost', 'Océane Ferry', 'Karim Bensaïd',
  'Justine Ollivier', 'Mathis Lacroix', 'Salomé Berger', 'Victor Hardy',
  'Maëlle Dumont', 'Arthur Charpentier', 'Lou Ferrand', 'Nassim Belkacem',
  'Charlotte Rey', 'Quentin Vidal', 'Awa Diallo', 'Corentin Maillard',
  'Faustine Legrand', 'Samuel Nguyen', 'Alix Perrot', 'Jonas Weber',
  'Célia Morvan', 'Bastien Guillot', 'Naïma Cherif', 'Timothée Roussel',
  'Mila Fontaine', 'Raphaël Ledoux', 'Solène Brunet', 'Achille Marty',
  'Iris Pichon', 'Élias Kaddour', 'Pauline Sauvage', 'Rémi Delatour',
  'Nina Cazeneuve', 'Loïc Meunier', 'Assia Rahali', 'Guillaume Astier',
  'Maëva Léger', 'Damien Rocher', 'Sabrina Kacem', 'Florian Bézier',
];

/**
 * Textes de commentaires racine — 72 variantes.
 * Volontairement génériques : ils doivent rester crédibles sous n'importe
 * quelle vidéo de l'instance.
 */
export const COMMENT_TEXTS: readonly string[] = [
  "Franchement excellent, j'ai regardé jusqu'au bout sans décrocher 👌",
  'Le montage est vraiment propre sur cette vidéo, bravo.',
  "Merci pour les explications, c'est enfin clair pour moi.",
  "Je suis arrivé ici par hasard et je reste, la chaîne est top 🔥",
  "Petite question : tu utilises quoi comme micro ? Le son est nickel.",
  "La partie à 4:32 mérite un chapitre à elle seule, très instructif.",
  'Je regarde en 1440p et la qualité tient parfaitement la route.',
  "Content de voir une nouvelle vidéo, ça faisait un moment !",
  "Le rythme est bon, on ne s'ennuie jamais.",
  "J'ai testé ta méthode ce week-end, ça marche vraiment.",
  "Tu pourrais faire une suite plus détaillée sur le sujet ?",
  "Sous-titres impeccables, merci de penser à tout le monde 🙏",
  "L'étalonnage des couleurs a beaucoup progressé, ça se voit.",
  'Bonne pédagogie, tu prends le temps sans jamais traîner.',
  "Je bloquais depuis des semaines, cette vidéo m'a débloqué.",
  "Vidéo enregistrée dans ma playlist, je reviendrai dessus.",
  "Question technique : ça tient la charge avec beaucoup de données ?",
  "Le passage sur les erreurs classiques est le plus utile selon moi.",
  "J'aime bien que tu montres aussi ce qui ne fonctionne pas.",
  'Le B-roll est très agréable, ça aère bien le propos.',
  "Grosse valeur ajoutée en 12 minutes, chapeau.",
  "Est-ce que la même approche fonctionne sur un projet plus ancien ?",
  'Sound design discret et efficace, exactement ce qu’il faut 🎧',
  "Je découvre la chaîne, je vais regarder tout le reste.",
  "Merci d'avoir cité tes sources, c'est suffisamment rare pour le dire.",
  "Le thumbnail donne bien envie, et le contenu suit derrière.",
  "Vidéo à montrer à tous les débutants, vraiment.",
  "Tu réponds à une question que je me posais depuis longtemps.",
  "Petit retour : un chapitre récapitulatif à la fin serait parfait.",
  'Très bon équilibre entre théorie et démonstration.',
  "La comparaison à mi-parcours était vraiment parlante.",
  "Le plan large en intro est superbe 😍",
  "Regardé deux fois, j'ai encore appris des choses au second passage.",
  'Cadrage impeccable et lumière très naturelle.',
  "Ça donne envie de s'y remettre sérieusement.",
  "Tu tournes avec quel objectif ? Le rendu est magnifique.",
  "Un des meilleurs formats de la plateforme sur ce thème.",
  "J'apprécie que tu ne survendes rien, tu restes factuel.",
  "Le chapitrage rend la vidéo hyper facile à naviguer.",
  "Est-ce que tu prévois un format plus long sur la partie avancée ?",
  'Le rythme des transitions est parfait, ni trop, ni trop peu.',
  "Merci, j'ai gagné un temps fou grâce à cette vidéo ⏱️",
  "Bonne surprise, je ne pensais pas rester aussi longtemps.",
  "L'explication du fonctionnement interne est très bien vulgarisée.",
  "Je partage à mon équipe, ça va servir 👍",
  'Très propre, du début à la fin.',
  "Le point sur les limites de la méthode est honnête, ça change.",
  "Tu as un vrai talent pour rendre simple ce qui ne l'est pas.",
  "Question : est-ce que ça change quelque chose sur une machine plus modeste ?",
  "Le mixage voix / musique est bien dosé, on entend tout.",
  'Vidéo dense mais jamais indigeste, bravo pour l’écriture.',
  "Je reviens juste dire que ça fonctionne encore un an après.",
  'Les schémas animés aident énormément à comprendre.',
  "J'aurais aimé un peu plus de détails sur la dernière partie.",
  "Le format court te va très bien aussi 🙂",
  "Excellente conclusion, elle résume tout sans rien oublier.",
  'Chaîne clairement sous-estimée vu la qualité.',
  "C'est exactement le niveau de détail que je cherchais.",
  "Ton approche pas à pas est vraiment rassurante pour débuter.",
  "Merci pour le récapitulatif écrit en description 📝",
  "La démonstration en conditions réelles vaut tous les discours.",
  "Je suis d'accord sur presque tout, sauf peut-être sur un point mineur.",
  "Belle progression depuis les premières vidéos de la chaîne.",
  "Ça se voit que la préparation a demandé du travail.",
  "Le tempo de la voix off est très agréable à écouter.",
  "Nickel, j'attendais ce sujet depuis longtemps 🙌",
  "Bien vu de montrer les réglages à l'écran, c'est reproductible.",
  "Petit détail : la musique couvre légèrement la voix vers la fin.",
  "Comment tu gères le cas où le fichier source est corrompu ?",
  "Je note l'astuce du milieu de vidéo, elle est excellente.",
  "Un vrai plaisir de regarder du contenu aussi soigné.",
  "Merci pour cette vidéo, sincèrement utile.",
];

/**
 * Textes réservés aux réponses (~20 % du lot) : formulés comme une réaction
 * à un commentaire existant plutôt qu'à la vidéo.
 */
export const REPLY_TEXTS: readonly string[] = [
  'Exactement, je me faisais la même remarque 👍',
  "Pareil de mon côté, ça a marché du premier coup.",
  "Je confirme, j'ai eu le même résultat.",
  'Bonne question, ça m’intéresse aussi.',
  "Je suis d'accord, ce passage était le plus clair.",
  "Merci pour la précision, je n'avais pas compris comme ça.",
  "Ah, je pensais être le seul à me poser la question 😄",
  'Tu as testé avec une autre configuration ?',
  "Complètement, la comparaison est très parlante.",
  "Bien vu, je n'avais pas remarqué ce détail.",
  "Même avis, mais je nuancerais un peu sur la fin.",
  'Merci du retour, ça me rassure avant de me lancer.',
  "Pas faux, même si ça dépend beaucoup du contexte.",
  "Oui, et en plus c'est expliqué sans jargon inutile.",
  'Je plussoie, très bonne remarque.',
  "Ça dépend de la version utilisée je pense.",
  "Bonne idée, je vais essayer comme ça.",
  "Tout à fait, c'était le point clé de la vidéo.",
  "Idem, j'ai dû regarder deux fois pour tout saisir.",
  'Merci, ta réponse complète bien la vidéo 🙏',
];

// ── Helpers déterministes ──────────────────────────────────────────────────

/** Translittération minimale des caractères accentués français. */
const ACCENT_MAP: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae',
};

/** « Théo Vasseur » -> « theo-vasseur ». Sans dépendance externe. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[àâäáãåçèéêëìíîïñòóôöõùúûüýÿœæ]/g, (c) => ACCENT_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Avatar déterministe : le même robot garde toujours la même image, ce qui
 * évite qu'une démo change de visage entre deux exécutions.
 */
export function botAvatarUrl(seed: string): string {
  return `https://picsum.photos/seed/${slugify(seed) || 'bot'}/200/200`;
}

/** Domaine réservé aux comptes synthétiques — jamais routable. */
export const BOT_EMAIL_DOMAIN = 'bots.kelvyntube.local';

/** `bot-42@bots.kelvyntube.local` */
export function botEmail(index: number): string {
  return `bot-${index}@${BOT_EMAIL_DOMAIN}`;
}

/**
 * Nom d'affichage du robot n° `index`. Au-delà du pool de pseudos on suffixe
 * un numéro pour garder des noms distincts sans jamais tomber en panne.
 */
export function botDisplayName(index: number): string {
  const base = BOT_DISPLAY_NAMES[(index - 1) % BOT_DISPLAY_NAMES.length] as string;
  const lap = Math.floor((index - 1) / BOT_DISPLAY_NAMES.length);
  return lap === 0 ? base : `${base} ${lap + 1}`;
}
