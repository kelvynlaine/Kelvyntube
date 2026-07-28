// ═══════════════════════════════════════════════════════════════════════════
//  Kelvyn Tube — Jeux de données statiques du seed de démonstration
//
//  Ce fichier ne contient AUCUNE logique : uniquement des listes de textes
//  (titres, descriptions, commentaires, tags…) consommées par `seed.ts`.
//  Tout est en français et pensé pour que l'interface soit crédible dès le
//  premier lancement, sans le moindre upload.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
//  Compte de démonstration
// ───────────────────────────────────────────────────────────────────────────

export const DEMO_EMAIL = 'kelvyn@kelvyntube.local';
export const DEMO_PASSWORD = 'Demo1234';

// ───────────────────────────────────────────────────────────────────────────
//  Référentiels (miroir de packages/shared/src/constants.ts)
//  Recopiés ici volontairement : `@kelvyntube/db` ne déclare pas
//  `@kelvyntube/shared` dans ses dépendances, et le seed ne doit pas en
//  ajouter. Garder les deux listes synchronisées en cas d'évolution.
// ───────────────────────────────────────────────────────────────────────────

/** Miroir de `DEFAULT_CATEGORIES`. */
export const CATEGORIES = [
  { slug: 'musique', name: 'Musique', icon: 'music', order: 1 },
  { slug: 'gaming', name: 'Gaming', icon: 'gamepad-2', order: 2 },
  { slug: 'tech', name: 'Tech', icon: 'cpu', order: 3 },
  { slug: 'sport', name: 'Sport', icon: 'dumbbell', order: 4 },
  { slug: 'vlog', name: 'Vlog', icon: 'video', order: 5 },
  { slug: 'education', name: 'Éducation', icon: 'graduation-cap', order: 6 },
  { slug: 'actualites', name: 'Actualités', icon: 'newspaper', order: 7 },
  { slug: 'cuisine', name: 'Cuisine', icon: 'chef-hat', order: 8 },
  { slug: 'humour', name: 'Humour', icon: 'laugh', order: 9 },
  { slug: 'voyage', name: 'Voyage', icon: 'plane', order: 10 },
  { slug: 'cinema', name: 'Cinéma', icon: 'clapperboard', order: 11 },
  { slug: 'auto', name: 'Auto & Moto', icon: 'car', order: 12 },
] as const;

/** Miroir de `RENDITIONS` (le seed n'utilise que 360p / 720p / 1080p). */
export const RENDITIONS = [
  { label: '240p', width: 426, height: 240, bitrateKbps: 400 },
  { label: '360p', width: 640, height: 360, bitrateKbps: 800 },
  { label: '480p', width: 854, height: 480, bitrateKbps: 1400 },
  { label: '720p', width: 1280, height: 720, bitrateKbps: 2800 },
  { label: '1080p', width: 1920, height: 1080, bitrateKbps: 5000 },
  { label: '1440p', width: 2560, height: 1440, bitrateKbps: 9000 },
  { label: '2160p', width: 3840, height: 2160, bitrateKbps: 18000 },
] as const;

// ───────────────────────────────────────────────────────────────────────────
//  Médias de remplacement
// ───────────────────────────────────────────────────────────────────────────

/** Base des miniatures / avatars / bannières (images déterministes et stables). */
export const PICSUM = 'https://picsum.photos/seed';

/** CDN fictif pour les playlists HLS des variantes. */
export const CDN_BASE = 'https://cdn.kelvyntube.local/vod';

/**
 * Base publique du stockage objet (MinIO en local, R2/B2 en production).
 * Doit rester alignée avec `CDN_PUBLIC_URL` côté API.
 */
const CDN_PUBLIC_URL =
  process.env.CDN_PUBLIC_URL ?? 'http://localhost:9000/kelvyntube';

/**
 * MP4 réellement lisibles, servis par NOTRE stockage objet.
 *
 * Les fichiers sont déposés dans le bucket par `npm run media:seed`, qui
 * télécharge des vidéos libres de droits (media.w3.org) une seule fois.
 * Conséquence : la démo est autonome — le lecteur fonctionne sans transcodage
 * ET sans dépendre d'un domaine tiers qui pourrait disparaître.
 *
 * Si `media:seed` n'a pas été lancé, le lecteur affiche proprement son écran
 * d'erreur ; tout le reste du site reste utilisable.
 */
export const MP4_SOURCES = [
  `${CDN_PUBLIC_URL}/demo/sintel.mp4`,
  `${CDN_PUBLIC_URL}/demo/bunny-trailer.mp4`,
  `${CDN_PUBLIC_URL}/demo/movie300.mp4`,
] as const;

// ───────────────────────────────────────────────────────────────────────────
//  Utilisateurs
// ───────────────────────────────────────────────────────────────────────────

export interface UserSeed {
  email: string;
  displayName: string;
  country: string;
  interests: string[];
  role: 'USER' | 'MODERATOR' | 'ADMIN';
}

/** L'index 0 est le compte de démonstration. */
export const USERS: UserSeed[] = [
  {
    email: DEMO_EMAIL,
    displayName: 'Kelvyn',
    country: 'FR',
    interests: ['tech', 'gaming', 'education', 'cuisine', 'voyage'],
    role: 'ADMIN',
  },
  { email: 'creator1@kelvyntube.local', displayName: 'Alex Dubois', country: 'FR', interests: ['tech', 'education'], role: 'USER' },
  { email: 'creator2@kelvyntube.local', displayName: 'Maxime Perrin', country: 'FR', interests: ['gaming', 'humour'], role: 'USER' },
  { email: 'creator3@kelvyntube.local', displayName: 'Camille Roux', country: 'BE', interests: ['cuisine', 'vlog'], role: 'USER' },
  { email: 'creator4@kelvyntube.local', displayName: 'Yanis Bouchard', country: 'CA', interests: ['voyage', 'vlog'], role: 'USER' },
  { email: 'creator5@kelvyntube.local', displayName: 'Sofia Marchetti', country: 'CH', interests: ['musique', 'tech'], role: 'USER' },
  { email: 'creator6@kelvyntube.local', displayName: 'Thomas Girard', country: 'FR', interests: ['cinema', 'actualites'], role: 'MODERATOR' },
  { email: 'creator7@kelvyntube.local', displayName: 'Nadia Belkacem', country: 'MA', interests: ['auto', 'tech'], role: 'USER' },
  { email: 'creator8@kelvyntube.local', displayName: 'Julien Mercier', country: 'FR', interests: ['sport', 'vlog'], role: 'USER' },
  { email: 'creator9@kelvyntube.local', displayName: 'Inès Lambert', country: 'FR', interests: ['actualites', 'education'], role: 'USER' },
  { email: 'creator10@kelvyntube.local', displayName: 'Hugo Lefèvre', country: 'BE', interests: ['humour', 'gaming'], role: 'USER' },
  { email: 'creator11@kelvyntube.local', displayName: 'Claire Vasseur', country: 'SN', interests: ['education', 'musique'], role: 'USER' },
];

// ───────────────────────────────────────────────────────────────────────────
//  Chaînes
// ───────────────────────────────────────────────────────────────────────────

export interface ChannelSeed {
  /** Index dans `USERS`. */
  ownerIndex: number;
  handle: string;
  name: string;
  description: string;
  location: string;
  links: { title: string; url: string }[];
  verified: boolean;
  monetizationEnabled: boolean;
  /** Catégories dans lesquelles la chaîne publie (pioche des titres). */
  categories: string[];
  /** Nombre de vidéos à générer pour cette chaîne. */
  videoCount: number;
  /** Dont ce nombre de Shorts. */
  shortCount: number;
  /** Facteur d'audience : multiplie le nombre de vues généré. */
  audienceFactor: number;
  /** Ancienneté de la chaîne en mois. */
  ageMonths: number;
}

export const CHANNELS: ChannelSeed[] = [
  {
    ownerIndex: 0,
    handle: 'kelvyn',
    name: 'Kelvyn',
    description:
      "Chaîne principale de Kelvyn : tech, développement web et productivité, expliqués simplement.\n\nUne nouvelle vidéo chaque mardi, un format court chaque vendredi. Les ressources citées sont toujours en description.",
    location: 'Lyon, France',
    links: [
      { title: 'Site', url: 'https://kelvyn.dev' },
      { title: 'Newsletter', url: 'https://kelvyn.dev/newsletter' },
      { title: 'GitHub', url: 'https://github.com/kelvyn' },
    ],
    verified: true,
    monetizationEnabled: true,
    categories: ['tech', 'education', 'vlog'],
    videoCount: 22,
    shortCount: 4,
    audienceFactor: 1.15,
    ageMonths: 26,
  },
  {
    ownerIndex: 0,
    handle: 'kelvyn-gaming',
    name: 'Kelvyn Gaming',
    description:
      "La chaîne secondaire, pour tout ce qui ne rentre pas sur la principale : sessions de jeu, tests de manettes et défis absurdes.",
    location: 'Lyon, France',
    links: [{ title: 'Discord', url: 'https://discord.gg/kelvyn' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['gaming'],
    videoCount: 6,
    shortCount: 2,
    audienceFactor: 0.55,
    ageMonths: 11,
  },
  {
    ownerIndex: 1,
    handle: 'techsimple',
    name: 'Tech Simple',
    description:
      "La tech sans jargon. Tests de matériel, tutoriels et guides d'achat honnêtes — jamais sponsorisés sans le dire.",
    location: 'Paris, France',
    links: [
      { title: 'Site', url: 'https://techsimple.fr' },
      { title: 'X', url: 'https://x.com/techsimple' },
    ],
    verified: true,
    monetizationEnabled: true,
    categories: ['tech'],
    videoCount: 7,
    shortCount: 2,
    audienceFactor: 1.6,
    ageMonths: 34,
  },
  {
    ownerIndex: 2,
    handle: 'gamezone',
    name: 'GameZone FR',
    description:
      "Gameplays, classements et speedruns. On joue beaucoup, on râle un peu, on s'amuse toujours.",
    location: 'Bordeaux, France',
    links: [
      { title: 'Twitch', url: 'https://twitch.tv/gamezonefr' },
      { title: 'Discord', url: 'https://discord.gg/gamezonefr' },
    ],
    verified: true,
    monetizationEnabled: true,
    categories: ['gaming'],
    videoCount: 7,
    shortCount: 2,
    audienceFactor: 1.8,
    ageMonths: 41,
  },
  {
    ownerIndex: 3,
    handle: 'cuisinerapide',
    name: 'Cuisine Rapide',
    description:
      "Des recettes qui tiennent en moins de 30 minutes, avec des ingrédients qu'on trouve vraiment en bas de chez soi.",
    location: 'Bruxelles, Belgique',
    links: [{ title: 'Instagram', url: 'https://instagram.com/cuisinerapide' }],
    verified: false,
    monetizationEnabled: true,
    categories: ['cuisine'],
    videoCount: 7,
    shortCount: 2,
    audienceFactor: 1.25,
    ageMonths: 22,
  },
  {
    ownerIndex: 4,
    handle: 'voyagesolo',
    name: 'Voyage Solo',
    description:
      "Partir seul, léger et sans se ruiner. Itinéraires détaillés, budgets réels et erreurs assumées.",
    location: 'Montréal, Canada',
    links: [{ title: 'Blog', url: 'https://voyagesolo.travel' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['voyage'],
    videoCount: 6,
    shortCount: 1,
    audienceFactor: 0.9,
    ageMonths: 18,
  },
  {
    ownerIndex: 5,
    handle: 'beatlab',
    name: 'BeatLab',
    description:
      "Production musicale, home studio et théorie appliquée. Du premier kick au master final.",
    location: 'Genève, Suisse',
    links: [
      { title: 'Bandcamp', url: 'https://beatlab.bandcamp.com' },
      { title: 'Samples', url: 'https://beatlab.audio/packs' },
    ],
    verified: true,
    monetizationEnabled: true,
    categories: ['musique'],
    videoCount: 6,
    shortCount: 1,
    audienceFactor: 1.0,
    ageMonths: 29,
  },
  {
    ownerIndex: 6,
    handle: 'cinedecryptage',
    name: 'Ciné Décryptage',
    description:
      "On regarde les films de près : mise en scène, montage, écriture. Sans spoiler gratuit.",
    location: 'Nantes, France',
    links: [{ title: 'Podcast', url: 'https://cinedecryptage.fr/podcast' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['cinema'],
    videoCount: 5,
    shortCount: 1,
    audienceFactor: 0.8,
    ageMonths: 16,
  },
  {
    ownerIndex: 7,
    handle: 'autopassion',
    name: 'Auto Passion',
    description:
      "Essais, restaurations et entretien. Thermique, électrique et deux-roues : tout y passe.",
    location: 'Casablanca, Maroc',
    links: [{ title: 'Garage', url: 'https://autopassion.ma' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['auto'],
    videoCount: 5,
    shortCount: 1,
    audienceFactor: 0.75,
    ageMonths: 14,
  },
  {
    ownerIndex: 8,
    handle: 'fitcoach',
    name: 'FitCoach',
    description:
      "Coach diplômé. Programmes progressifs, technique irréprochable et zéro promesse magique.",
    location: 'Marseille, France',
    links: [{ title: 'Programmes', url: 'https://fitcoach.fr/programmes' }],
    verified: false,
    monetizationEnabled: true,
    categories: ['sport'],
    videoCount: 5,
    shortCount: 2,
    audienceFactor: 0.95,
    ageMonths: 20,
  },
  {
    ownerIndex: 9,
    handle: 'actuexpress',
    name: 'Actu Express',
    description:
      "L'essentiel de l'actualité en quelques minutes, sources à l'appui. Deux éditions par semaine.",
    location: 'Paris, France',
    links: [{ title: 'Sources', url: 'https://actuexpress.info/sources' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['actualites'],
    videoCount: 5,
    shortCount: 0,
    audienceFactor: 0.7,
    ageMonths: 9,
  },
  {
    ownerIndex: 10,
    handle: 'rireetcie',
    name: 'Rire & Cie',
    description: 'Sketchs, parodies et observations du quotidien. Nouveau format tous les jeudis.',
    location: 'Liège, Belgique',
    links: [{ title: 'TikTok', url: 'https://tiktok.com/@rireetcie' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['humour'],
    videoCount: 5,
    shortCount: 2,
    audienceFactor: 1.35,
    ageMonths: 12,
  },
  {
    ownerIndex: 11,
    handle: 'profdemaths',
    name: 'Prof de Maths',
    description:
      "Cours et méthodes du collège au supérieur. Objectif : comprendre, pas apprendre par cœur.",
    location: 'Dakar, Sénégal',
    links: [{ title: 'Exercices', url: 'https://profdemaths.edu/exercices' }],
    verified: false,
    monetizationEnabled: false,
    categories: ['education'],
    videoCount: 5,
    shortCount: 0,
    audienceFactor: 0.85,
    ageMonths: 24,
  },
];

// ───────────────────────────────────────────────────────────────────────────
//  Titres de vidéos, par catégorie
// ───────────────────────────────────────────────────────────────────────────

export const VIDEO_TITLES: Record<string, string[]> = {
  musique: [
    "J'ai recréé le son des années 80 avec un seul synthé",
    'Comment écrire une mélodie qui reste dans la tête',
    'Mixage : 7 erreurs que font tous les débutants',
    'Session live acoustique — quatre titres au coin du feu',
    'Le meilleur home studio à moins de 500 €',
    "J'analyse le morceau le plus streamé de l'année",
    'Composer un beat lo-fi de A à Z en 20 minutes',
    'Pourquoi cette progression d’accords fonctionne toujours',
    'Test : 5 micros à moins de 200 € comparés',
    'Reprise piano — le morceau qui m’a fait aimer la musique',
  ],
  gaming: [
    "J'ai fini le jeu le plus dur de l'année sans mourir une seule fois",
    'Le classement définitif des meilleurs FPS de 2026',
    'Speedrun : je bats mon record personnel en direct',
    'Ce build est totalement cassé (et je vous explique pourquoi)',
    '24 h sur le nouveau serveur — premières impressions',
    'Les 10 secrets que personne n’a trouvés dans ce jeu',
    'J’ai terminé le mode difficile avec une manette cassée',
    'Setup gaming 2026 : ce que j’ai vraiment changé',
    'Ranked : de Bronze à Diamant en une seule saison',
    'Rétro : pourquoi ce jeu de 2004 est encore parfait',
    'Le patch qui a tout changé — analyse complète',
  ],
  tech: [
    "J'ai remplacé mon Mac par un mini PC à 300 €",
    'React 19 : ce qui change vraiment pour votre code',
    'Docker expliqué simplement en 12 minutes',
    'Mon setup de développeur en 2026 — le tour complet',
    'TypeScript : 8 astuces que j’aurais aimé connaître plus tôt',
    'Test du clavier mécanique qui divise tout internet',
    'Créer une API REST propre avec Fastify et Prisma',
    'Pourquoi j’ai quitté le no-code après deux ans',
    'Self-hosting : héberger ses services à la maison',
    'Git : les commandes qui sauvent une journée entière',
    'J’ai fait tourner un modèle d’IA sur un vieux portable',
    'Optimiser le temps de build : de 90 s à 6 s',
  ],
  sport: [
    'Programme full body : 30 minutes, zéro matériel',
    "J'ai couru 10 km par jour pendant un mois entier",
    'Mobilité : la routine que font les pros avant l’entraînement',
    'Les erreurs de posture qui ruinent vos squats',
    'Préparer un semi-marathon en 8 semaines',
    'Gainage : 8 minutes qui changent tout',
    'Alimentation sportive : ce que je mange vraiment',
    'Retour de blessure — comment je reprends sans rechuter',
  ],
  vlog: [
    'Une semaine dans ma vie de créateur à Lyon',
    'On a emménagé — premier jour dans le nouvel appartement',
    'Ma routine du matin (version réaliste)',
    '48 h sans téléphone : ce que j’en ai retenu',
    'Vlog de tournage — les coulisses du dernier projet',
    'Le jour où absolument tout est allé de travers',
    'Je réponds à vos questions en préparant le dîner',
    'Bilan de l’année : ce qui a marché, ce qui a raté',
  ],
  education: [
    'Comprendre les probabilités en 15 minutes',
    'La méthode qui m’a fait réussir toutes mes révisions',
    'Les intégrales expliquées sans formules effrayantes',
    'Apprendre une langue : la technique des 20 heures',
    'Prendre des notes efficacement — la méthode Cornell',
    'Le théorème de Pythagore comme vous ne l’avez jamais vu',
    'Histoire : comment on a vraiment mesuré la Terre',
    'Mémoriser 100 mots par semaine, c’est possible',
  ],
  actualites: [
    'Le point sur l’actualité tech de la semaine',
    'Décryptage : ce que dit vraiment le nouveau rapport',
    'Trois informations à retenir ce matin',
    'Comprendre la réforme en 6 minutes',
    'Revue de presse — édition du week-end',
    'Ce que les chiffres du mois nous apprennent',
  ],
  cuisine: [
    'Le meilleur risotto que j’ai jamais fait',
    'Pâtes carbonara : la vraie recette, sans crème',
    'Batch cooking : 5 repas préparés en une heure',
    'Pain maison sans machine — recette inratable',
    'Trois desserts express à moins de 3 €',
    'J’ai testé la recette virale : verdict sans filtre',
    'Comment réussir une pâte à pizza napolitaine',
    'Le poulet rôti parfait, étape par étape',
    'Ramen maison : le bouillon en 45 minutes',
  ],
  humour: [
    'Les 10 types de collègues que tout le monde connaît',
    'Quand tu essaies de monter un meuble en kit',
    'Sketch : le service client de l’enfer',
    'J’ai lu vos pires messages privés',
    'Les GPS ont vraiment un problème avec moi',
    'Parodie : les tutoriels en ligne en 2026',
  ],
  voyage: [
    'Trois jours à Lisbonne avec 200 € en poche',
    'J’ai pris le train le plus long d’Europe',
    'Voyager seul : ce que personne ne vous dit',
    'Islande en van — le road trip complet',
    'Le Japon hors des sentiers battus',
    'Comment je trouve des vols à moins de 50 €',
    '48 h à Marrakech — guide express',
    'Randonnée dans les Dolomites : itinéraire complet',
  ],
  cinema: [
    'Pourquoi ce film a changé le cinéma moderne',
    'Analyse : le plan-séquence le plus fou jamais tourné',
    'Top 10 des films à voir absolument cette année',
    'Les effets spéciaux d’avant étaient-ils meilleurs ?',
    'Décryptage de la fin qui a divisé les spectateurs',
    'Comment on écrit un bon personnage secondaire',
    'Le montage expliqué avec trois scènes cultes',
  ],
  auto: [
    'Essai complet : la citadine électrique qui surprend',
    'J’ai restauré une voiture de 1992 dans mon garage',
    'Électrique contre thermique : le vrai calcul sur 5 ans',
    'Entretien : 6 gestes qui prolongent la vie du moteur',
    'Road trip en moto sur 1 200 km',
    'Pourquoi ce SUV est un mauvais achat',
    'Test pneus : le freinage sur sol mouillé comparé',
  ],
};

/** Titres réservés aux Shorts (format vertical, 15-59 s), par catégorie. */
export const SHORT_TITLES: Record<string, string[]> = {
  musique: [
    'Ce son est fait avec une casserole',
    'Le son des années 90 en une minute',
    'Trois accords, une ambiance entière',
  ],
  gaming: [
    'Ce combo est totalement illégal 😳',
    'Ce plan m’a pris quatre heures',
    'Le meilleur move de la saison',
    'Il ne l’a jamais vu venir',
    'Réflexe à deux dixièmes de seconde',
  ],
  tech: [
    'Trois secondes pour comprendre les tableaux croisés',
    'Le raccourci clavier que personne n’utilise',
    'Ma configuration en 15 secondes',
    'Cette ligne de code économise deux heures',
    'Personne ne connaît cette fonctionnalité',
  ],
  sport: [
    'Test de force : réussi ou pas ?',
    'Un exercice, zéro matériel',
    'Avant / après : six mois d’entraînement',
    'La bonne position en 20 secondes',
  ],
  vlog: [
    'Une journée entière en 30 secondes',
    'Le bug le plus drôle de ma carrière',
    'Réponse en 30 secondes à votre question',
  ],
  education: [
    'Trois mots pour retenir cette règle',
    'Cette astuce de calcul mental est imparable',
    'La faute que tout le monde fait',
  ],
  actualites: [
    'L’info du jour en 40 secondes',
    'Le chiffre à retenir cette semaine',
    'Ce que dit vraiment le rapport',
  ],
  cuisine: [
    'Cette astuce va changer ta façon de cuisiner 🔥',
    'La technique du chef en 20 secondes',
    'Le café parfait, vraiment',
    'La recette la plus rapide du monde',
  ],
  humour: [
    'POV : tu ouvres ton frigo à 23 h',
    'Quand le GPS te trahit complètement',
    'Le collègue du lundi matin',
    'Quand tu dis « juste une petite vidéo »',
  ],
  voyage: [
    'Le meilleur spot de Lisbonne',
    'Ce village n’a que 40 habitants',
    'Le train le moins cher d’Europe',
  ],
  cinema: [
    'On a compté les erreurs de ce film',
    'Ce détail change tout dans la scène',
    'Le plan le plus copié du cinéma',
  ],
  auto: [
    'Il ne faut jamais faire ça au volant',
    'Ce bruit annonce une grosse facture',
    'Le geste qui sauve tes pneus',
  ],
};

// ───────────────────────────────────────────────────────────────────────────
//  Fragments de descriptions
// ───────────────────────────────────────────────────────────────────────────

export const DESCRIPTION_HOOKS: string[] = [
  'Dans cette vidéo, on reprend tout depuis le début, calmement et sans raccourci.',
  'J’ai passé trois semaines à préparer ce sujet, voici tout ce que j’ai appris.',
  'C’est la question qui revient le plus souvent en commentaire : voici la réponse complète.',
  'On m’a demandé une version plus détaillée — la voici, avec les cas particuliers.',
  'Beaucoup d’idées reçues circulent sur ce sujet. On fait le tri ensemble.',
  'Un format un peu différent aujourd’hui : plus de démonstrations, moins de théorie.',
  'Voici la méthode que j’utilise réellement au quotidien, sans version idéalisée.',
  'Si vous débutez, cette vidéo est faite pour vous : on ne saute aucune étape.',
];

export const DESCRIPTION_BODIES: string[] = [
  'On commence par le contexte, puis on passe à la pratique avec un exemple concret que vous pouvez reproduire chez vous.',
  'Tous les outils utilisés sont gratuits ou déjà installés sur votre machine. Aucun achat n’est nécessaire pour suivre.',
  'J’ai volontairement gardé les erreurs de tournage : elles font partie du processus et vous éviteront de les répéter.',
  'Les chiffres cités proviennent de mes propres mesures, réalisées sur trois mois. La méthodologie est expliquée en fin de vidéo.',
  'Si un passage n’est pas clair, dites-le en commentaire : je réponds à tout le monde dans les 48 heures.',
  'Cette vidéo est la première d’une série de trois. Les suivantes couvriront les cas avancés et le dépannage.',
  'Le résultat final n’est pas parfait, et c’est justement le sujet : on progresse en acceptant les compromis.',
];

export const DESCRIPTION_CTAS: string[] = [
  'Abonnez-vous pour ne rien rater des prochaines vidéos.',
  'Un pouce bleu aide énormément la chaîne, merci à vous.',
  'Dites-moi en commentaire quel sujet vous voulez voir ensuite.',
  'Toutes les ressources citées sont dans les liens ci-dessus.',
  'Activez la cloche 🔔 pour être prévenu des nouvelles publications.',
];

/** Titres de chapitres génériques (le premier est toujours « Introduction »). */
export const CHAPTER_TITLES: string[] = [
  'Le contexte',
  'Ce qu’il faut préparer',
  'Première étape',
  'La démonstration',
  'Les erreurs à éviter',
  'Le cas particulier',
  'Comparaison des options',
  'Mes résultats',
  'Questions fréquentes',
  'Aller plus loin',
  'Bilan',
  'Conclusion',
];

// ───────────────────────────────────────────────────────────────────────────
//  Tags / hashtags
// ───────────────────────────────────────────────────────────────────────────

export interface TagSeed {
  name: string;
  /** Force un `trendingScore` > 0.7 (hashtags mis en avant). */
  trending: boolean;
}

export const TAGS: TagSeed[] = [
  { name: 'tuto', trending: true },
  { name: 'astuces', trending: false },
  { name: 'debutant', trending: false },
  { name: '2026', trending: true },
  { name: 'ia', trending: true },
  { name: 'react', trending: false },
  { name: 'typescript', trending: false },
  { name: 'javascript', trending: false },
  { name: 'webdev', trending: false },
  { name: 'docker', trending: false },
  { name: 'setup', trending: false },
  { name: 'productivite', trending: false },
  { name: 'tech', trending: false },
  { name: 'gaming', trending: true },
  { name: 'gameplay', trending: false },
  { name: 'speedrun', trending: false },
  { name: 'fps', trending: false },
  { name: 'retrogaming', trending: false },
  { name: 'recette', trending: true },
  { name: 'cuisine', trending: false },
  { name: 'batchcooking', trending: false },
  { name: 'patisserie', trending: false },
  { name: 'voyage', trending: false },
  { name: 'roadtrip', trending: false },
  { name: 'budget', trending: false },
  { name: 'japon', trending: false },
  { name: 'sport', trending: false },
  { name: 'fitness', trending: false },
  { name: 'running', trending: false },
  { name: 'musculation', trending: false },
  { name: 'musique', trending: false },
  { name: 'homestudio', trending: false },
  { name: 'beatmaking', trending: false },
  { name: 'mixage', trending: false },
  { name: 'cinema', trending: false },
  { name: 'analyse', trending: false },
  { name: 'auto', trending: false },
  { name: 'electrique', trending: false },
  { name: 'vlog', trending: false },
  { name: 'shorts', trending: true },
];

/** Tags plausibles pour chaque catégorie (pioche pondérée). */
export const TAGS_BY_CATEGORY: Record<string, string[]> = {
  musique: ['musique', 'homestudio', 'beatmaking', 'mixage', 'tuto', 'astuces', 'debutant'],
  gaming: ['gaming', 'gameplay', 'speedrun', 'fps', 'retrogaming', 'setup', '2026'],
  tech: ['tech', 'react', 'typescript', 'javascript', 'webdev', 'docker', 'setup', 'ia', 'tuto', 'productivite'],
  sport: ['sport', 'fitness', 'running', 'musculation', 'debutant', 'astuces'],
  vlog: ['vlog', 'productivite', 'astuces', 'budget', '2026'],
  education: ['tuto', 'debutant', 'astuces', 'analyse', 'productivite'],
  actualites: ['2026', 'ia', 'tech', 'analyse'],
  cuisine: ['cuisine', 'recette', 'batchcooking', 'patisserie', 'budget', 'astuces'],
  humour: ['vlog', 'shorts', '2026', 'astuces'],
  voyage: ['voyage', 'roadtrip', 'budget', 'japon', 'vlog'],
  cinema: ['cinema', 'analyse', '2026'],
  auto: ['auto', 'electrique', 'roadtrip', 'tuto', 'astuces'],
};

// ───────────────────────────────────────────────────────────────────────────
//  Commentaires
// ───────────────────────────────────────────────────────────────────────────

export const COMMENT_TEXTS: string[] = [
  'Franchement, c’est la vidéo la plus claire que j’ai vue sur le sujet. Merci !',
  'Le passage à 4:12 m’a débloqué complètement, j’ai galéré des semaines là-dessus.',
  'Qualité de montage au top comme d’habitude 👌',
  'Je regarde ta chaîne depuis le début, et là tu as vraiment passé un cap.',
  'Petite question : est-ce que ça marche aussi sur une configuration plus ancienne ?',
  'J’ai testé ce matin, résultat impeccable. Merci pour le partage !',
  'Enfin quelqu’un qui explique sans faire 40 minutes de blabla.',
  'Le son est un peu bas sur cette vidéo, mais le contenu est excellent.',
  'Ça mérite beaucoup plus de vues, sincèrement.',
  'Tu peux faire une suite plus détaillée sur la partie avancée ?',
  'Je ne suis pas d’accord sur le point 3, mais la vidéo reste très bien argumentée.',
  'Première fois que je comprends ce truc, merci beaucoup 🙏',
  'Le découpage en chapitres est parfait, ça aide énormément.',
  'Abonné directement après cette vidéo.',
  'J’ai partagé à toute mon équipe, on en avait vraiment besoin.',
  'Combien de temps tu as mis à monter ça ? Le rendu est fou.',
  'Je reviens six mois plus tard et c’est toujours d’actualité.',
  'Ça ne marche pas chez moi, j’ai un message d’erreur à l’étape 2.',
  'Merci pour les liens en description, super utile.',
  'La miniature m’a fait cliquer, le contenu m’a fait rester 😄',
  'Excellente vidéo, par contre attention à la faute dans le titre du chapitre 3.',
  'Le meilleur créateur francophone sur ce thème, sans hésiter.',
  'J’attendais cette vidéo depuis des mois !',
  'Simple, clair, efficace. Rien à jeter.',
  'Est-ce que tu prévois une version pour grands débutants ?',
  'La partie sur les erreurs courantes m’a évité de tout recommencer.',
  'Vraiment agréable à regarder, le rythme est parfait.',
  'Un peu long à démarrer mais ça vaut le coup d’attendre.',
  'Je note tout, merci pour la méthode !',
  'Ce passage à la fin, je l’ai revu cinq fois 😂',
  'Bravo pour la transparence, ça change des vidéos sponsorisées déguisées.',
  'Tu as des sources sur les chiffres que tu cites ?',
  'Content de voir que tu as changé de micro, la différence s’entend.',
  'Ma mère a réussi la recette du premier coup, c’est dire !',
  'Je viens de Belgique et je suis fan de ce que tu fais.',
  'Le montage est propre mais la musique de fond couvre un peu ta voix.',
  'Vidéo sauvegardée dans mes favoris, je vais y revenir souvent.',
  'Merci pour le rappel, j’avais totalement oublié cette astuce.',
  'Sérieusement, comment tu fais pour sortir du contenu de cette qualité ?',
  'Petit conseil : ajoute des sous-titres, ça aiderait beaucoup de monde.',
  'J’ai appliqué et j’ai gagné deux heures cette semaine.',
  'Ton explication est meilleure que celle de mon prof, franchement.',
  'La comparaison de la fin met vraiment les choses en perspective.',
  'Ça change tout, merci ! Je ne savais pas que c’était possible.',
  'Contenu solide, mais j’aurais aimé plus d’exemples concrets.',
  'Team première heure 🙋',
  'Je découvre la chaîne aujourd’hui et je regarde tout d’affilée.',
  'Tu mérites un million d’abonnés.',
  'L’introduction est top, elle donne envie de rester.',
  'Est-ce que tu pourrais partager ton fichier de configuration ?',
  'Franchement respect pour le travail, ça se voit.',
  'Petite précision : ça dépend aussi de la version qu’on utilise.',
  'Le meilleur investissement de mes vingt dernières minutes.',
  'J’ai ri au moment du raté 😅 Merci pour l’honnêteté.',
  'Tu m’as convaincu, je m’y mets ce week-end.',
  'Vidéo parfaite pour reprendre après une longue pause.',
  'Merci d’avoir montré les échecs aussi, c’est rare.',
  'Je regarde toujours tes vidéos en fond pendant que je travaille.',
  'Ça faisait longtemps qu’une vidéo ne m’avait pas autant appris.',
  'Est-ce que le résultat tient dans le temps ?',
  'La qualité d’image est superbe, tu filmes avec quoi ?',
  'J’avais des doutes au début, mais tu m’as fait changer d’avis.',
  'Une petite erreur à 7:30 mais rien de grave, super vidéo.',
  'Le genre de vidéo qu’on a envie de montrer à tout le monde.',
  'C’est exactement ce que je cherchais depuis des semaines.',
  'Bravo, tu expliques vraiment bien, même les parties complexes.',
  'Vidéo utile, mais un peu trop rapide sur la fin.',
  'Je fais ça depuis dix ans et j’ai encore appris des choses.',
  'Le rapport qualité / durée est imbattable.',
  'Merci pour cette pépite, je m’abonne 🔔',
];

export const REPLY_TEXTS: string[] = [
  'Merci beaucoup, ça fait très plaisir à lire !',
  'Oui ça fonctionne, il faut juste adapter la première étape.',
  'Pareil pour moi, j’ai eu exactement le même souci au début.',
  'Regarde à 3:45, il l’explique justement.',
  'Je confirme, testé hier soir.',
  'Bonne remarque, je préciserai ça dans une prochaine vidéo.',
  'Ah bon ? Chez moi ça marche parfaitement.',
  'Les sources sont dans la description 😉',
  'Complètement d’accord avec toi.',
  'Ça dépend vraiment de ta configuration, essaie la version 2.',
  'Merci pour le retour, je note !',
  'Non, il faut la dernière version pour que ça fonctionne.',
  'Je suis passé par là, courage 💪',
  'Exactement ce que j’allais dire.',
  'Tu peux aussi faire l’inverse, ça marche aussi bien.',
  'Désolé pour le son, le micro a lâché en plein tournage.',
  'Une suite arrive le mois prochain, promis !',
  'Franchement je ne suis pas d’accord, mais je comprends ton point de vue.',
  'Merci, c’est corrigé dans les chapitres 👍',
  'Oui c’est prévu, j’y travaille déjà.',
  'Essaie de tout redémarrer, ça résout 90 % des cas.',
  'Haha oui ce moment était totalement involontaire 😂',
  'Bienvenue sur la chaîne !',
  'Tu as raison, j’aurais dû détailler davantage.',
  'Ça dépend du matériel, mais globalement oui.',
  'Merci à toi d’avoir regardé jusqu’au bout.',
  'Il y a un lien en description pour ça.',
  'Même problème, résolu en changeant l’ordre des étapes.',
  'C’est noté, merci pour la suggestion !',
  'Pas besoin, la version gratuite suffit largement.',
  'Je l’ai fait aussi et le résultat est nickel.',
  'Attention, ça a changé depuis la dernière mise à jour.',
  'Ravi que ça t’ait aidé 🙌',
  'Écris-moi en message privé, je t’aiderai volontiers.',
  'Sous-titres ajoutés, merci pour le retour !',
];

/** Commentaires épinglés, écrits par le créateur de la chaîne. */
export const PINNED_TEXTS: string[] = [
  '📌 Merci à tous pour l’accueil ! Les ressources sont en description, et je réponds à un maximum de commentaires ce soir.',
  '📌 Petite correction : à 5:12 je dis 2024 au lieu de 2026. Désolé pour la confusion !',
  '📌 Si vous voulez la suite, dites-le en commentaire — le plan de la partie 2 est déjà prêt.',
  '📌 Le fichier de configuration est disponible en description. Bon visionnage !',
  '📌 On dépasse largement les objectifs, merci infiniment 🙏 La prochaine vidéo arrive vendredi.',
  '📌 Question la plus posée : oui, ça fonctionne aussi sans matériel supplémentaire.',
  '📌 J’ai ajouté les chapitres suite à vos retours, la navigation est plus simple.',
  '📌 Merci pour les 500 premiers commentaires, je lis absolument tout !',
];

export const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👏', '🤯', '🙏'] as const;

// ───────────────────────────────────────────────────────────────────────────
//  Recherche, communauté, playlists
// ───────────────────────────────────────────────────────────────────────────

export const SEARCH_QUERIES: string[] = [
  'tuto react',
  'recette carbonara',
  'setup gaming 2026',
  'docker debutant',
  'voyage japon budget',
  'musculation maison',
  'beat lo-fi',
  'analyse film',
  'voiture electrique essai',
  'typescript astuces',
  'pain maison',
  'speedrun record',
  'prisma fastify',
  'programme full body',
  'vlog lyon',
  'montage video',
  'clavier mecanique',
  'risotto recette',
  'islande van',
  'methode de revision',
  'kelvyn',
  'techsimple',
  'gamezone',
  'cuisine rapide',
  'shorts drole',
  'actualite tech',
  'self hosting',
  'commandes git',
  'semi marathon',
  'home studio pas cher',
  'meilleur micro 200 euros',
  'lisbonne 3 jours',
  'ramen maison',
  'batch cooking',
  'pizza napolitaine',
  'retrogaming 2004',
  'react 19',
  'mini pc 300 euros',
  'podcast tech francais',
  'apprendre une langue',
  'cours probabilites',
  'plan sequence cinema',
  'top film 2026',
  'road trip moto',
  'test pneus mouille',
  'gainage 8 minutes',
  'poulet roti',
  'dessert express',
  'guide marrakech',
  'randonnee dolomites',
  'ia generative',
  'erreur squat',
  'reprise apres blessure',
  'mixage debutant',
  'progression accords',
  'serveur multijoueur',
  'classement fps',
  'productivite developpeur',
  'methode cornell',
  'budget voyage europe',
];

export const COMMUNITY_POSTS: string[] = [
  'Nouvelle vidéo demain à 18 h : on démonte le mythe du « setup parfait ». Vous voulez que je parle de quoi en priorité ? 👇',
  'Merci pour l’accueil sur la dernière vidéo, c’est mon meilleur démarrage depuis le début de la chaîne 🙏',
  'Petit sondage : plutôt format court (8-10 min) ou format long et détaillé (25 min) ?',
  'Coulisses du tournage d’hier — quatre heures de rushes pour douze minutes de vidéo 😅',
  'Je prends une semaine de pause pour préparer une série de cinq vidéos. Ça arrive très vite !',
];

export interface PlaylistSeed {
  title: string;
  description: string;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  /** Catégories dans lesquelles piocher les vidéos. */
  categories: string[];
  itemCount: number;
}

export const USER_PLAYLISTS: PlaylistSeed[] = [
  {
    title: 'Setup & productivité',
    description: 'Tout ce que j’utilise au quotidien pour travailler plus vite, sans me disperser.',
    visibility: 'PUBLIC',
    categories: ['tech', 'vlog', 'education'],
    itemCount: 11,
  },
  {
    title: 'Recettes du dimanche',
    description: 'Les plats que je refais en boucle le week-end, quand j’ai enfin le temps.',
    visibility: 'PUBLIC',
    categories: ['cuisine'],
    itemCount: 7,
  },
  {
    title: 'À revoir — Gaming',
    description: 'Les vidéos gaming que je garde sous le coude pour les soirs de flemme.',
    visibility: 'UNLISTED',
    categories: ['gaming', 'humour'],
    itemCount: 8,
  },
];

// ───────────────────────────────────────────────────────────────────────────
//  Analytics : dimensions des répartitions journalières
// ───────────────────────────────────────────────────────────────────────────

/** Sources de trafic et leur poids relatif (miroir de l'enum `TrafficSource`). */
export const TRAFFIC_SOURCE_WEIGHTS: Record<string, number> = {
  HOME: 34,
  SUGGESTED: 24,
  SEARCH: 16,
  SHORTS: 8,
  CHANNEL: 6,
  EXTERNAL: 5,
  PLAYLIST: 3,
  NOTIFICATION: 3,
  DIRECT: 1,
};

/** Types d'appareil et leur poids relatif (miroir de l'enum `DeviceType`). */
export const DEVICE_WEIGHTS: Record<string, number> = {
  MOBILE: 58,
  DESKTOP: 27,
  TABLET: 8,
  TV: 6,
  UNKNOWN: 1,
};

/** Pays de l'audience francophone et leur poids relatif. */
export const COUNTRY_WEIGHTS: Record<string, number> = {
  FR: 55,
  BE: 11,
  CA: 9,
  CH: 6,
  MA: 5,
  DZ: 4,
  SN: 3,
  CI: 3,
  TN: 2,
  US: 2,
};

/** Tranches d'âge et leur poids relatif. */
export const AGE_WEIGHTS: Record<string, number> = {
  '13-17': 6,
  '18-24': 24,
  '25-34': 33,
  '35-44': 19,
  '45-54': 11,
  '55-64': 5,
  '65+': 2,
};

// ───────────────────────────────────────────────────────────────────────────
//  Notifications
// ───────────────────────────────────────────────────────────────────────────

export interface NotificationSeed {
  type:
    | 'NEW_SUBSCRIBER'
    | 'NEW_VIDEO'
    | 'NEW_COMMENT'
    | 'COMMENT_REPLY'
    | 'COMMENT_MENTION'
    | 'COMMENT_HEARTED'
    | 'VIDEO_PROCESSED'
    | 'VIDEO_FAILED'
    | 'MILESTONE';
  title: string;
  body: string;
  /** `video` = lien vers une vidéo, `channel` = lien vers une chaîne, `studio` = Studio. */
  target: 'video' | 'channel' | 'studio';
  read: boolean;
  /** Ancienneté en heures. */
  ageHours: number;
}

export const NOTIFICATIONS: NotificationSeed[] = [
  { type: 'NEW_VIDEO', title: 'Tech Simple a publié une vidéo', body: 'Test du clavier mécanique qui divise tout internet', target: 'video', read: false, ageHours: 2 },
  { type: 'NEW_COMMENT', title: 'Nouveau commentaire sur votre vidéo', body: 'Franchement, c’est la vidéo la plus claire que j’ai vue sur le sujet.', target: 'video', read: false, ageHours: 5 },
  { type: 'NEW_SUBSCRIBER', title: 'Camille Roux s’est abonnée à Kelvyn', body: 'Vous avez un nouvel abonné.', target: 'channel', read: false, ageHours: 9 },
  { type: 'VIDEO_PROCESSED', title: 'Votre vidéo est en ligne', body: 'Le traitement est terminé, la vidéo est disponible en 1080p.', target: 'studio', read: false, ageHours: 14 },
  { type: 'MILESTONE', title: 'Palier atteint 🎉', body: 'Votre vidéo vient de dépasser les 100 000 vues.', target: 'video', read: false, ageHours: 22 },
  { type: 'COMMENT_REPLY', title: 'Alex Dubois a répondu à votre commentaire', body: 'Oui ça fonctionne, il faut juste adapter la première étape.', target: 'video', read: false, ageHours: 30 },
  { type: 'NEW_VIDEO', title: 'GameZone FR a publié une vidéo', body: 'Ranked : de Bronze à Diamant en une seule saison', target: 'video', read: true, ageHours: 40 },
  { type: 'COMMENT_HEARTED', title: 'BeatLab a aimé votre commentaire ❤️', body: 'Votre commentaire a reçu un cœur du créateur.', target: 'video', read: true, ageHours: 52 },
  { type: 'VIDEO_FAILED', title: 'Échec du traitement', body: 'Le fichier source semble corrompu. Relancez l’upload depuis le Studio.', target: 'studio', read: true, ageHours: 61 },
  { type: 'NEW_SUBSCRIBER', title: 'Hugo Lefèvre s’est abonné à Kelvyn', body: 'Vous avez un nouvel abonné.', target: 'channel', read: true, ageHours: 74 },
  { type: 'COMMENT_MENTION', title: 'Vous avez été mentionné', body: '@kelvyn tu confirmes que ça marche aussi en 1080p ?', target: 'video', read: true, ageHours: 88 },
  { type: 'NEW_VIDEO', title: 'Cuisine Rapide a publié une vidéo', body: 'Batch cooking : 5 repas préparés en une heure', target: 'video', read: true, ageHours: 100 },
  { type: 'MILESTONE', title: 'Palier atteint 🎉', body: 'Kelvyn a dépassé les 5 abonnés cette semaine.', target: 'channel', read: true, ageHours: 130 },
  { type: 'NEW_COMMENT', title: 'Nouveau commentaire sur votre vidéo', body: 'Est-ce que tu pourrais partager ton fichier de configuration ?', target: 'video', read: true, ageHours: 156 },
  { type: 'VIDEO_PROCESSED', title: 'Votre Short est en ligne', body: 'Le traitement vertical est terminé.', target: 'studio', read: true, ageHours: 190 },
];
