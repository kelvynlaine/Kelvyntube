# 🎬 Kelvyn Tube

Plateforme de partage de vidéos complète — architecture, ergonomie et performance calquées sur YouTube, sur une base de code TypeScript modulaire et scalable.

---

## Sommaire

- [Stack technique](#stack-technique)
- [Architecture du monorepo](#architecture-du-monorepo)
- [Démarrage rapide](#démarrage-rapide)
- [Compte de démonstration](#compte-de-démonstration)
- [Services locaux](#services-locaux)
- [Fonctionnalités](#fonctionnalités)
- [Pipeline vidéo](#pipeline-vidéo)
- [Système de vues](#système-de-vues)
- [Algorithme de distribution](#algorithme-de-distribution)
- [Documentation](#documentation)
- [Commandes utiles](#commandes-utiles)
- [Mode dégradé](#mode-dégradé)

---

## Stack technique

| Domaine | Technologie |
|---|---|
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS |
| Backend | Fastify 5 · TypeScript · REST + WebSocket |
| Base de données | PostgreSQL 16 · Prisma ORM |
| Cache / temps réel | Redis 7 (compteurs de vues, sessions, Pub/Sub, files) |
| File d'attente | BullMQ (transcodage, miniatures, notifications, indexation, analytics) |
| Stockage objet | S3-compatible — MinIO en local, Cloudflare R2 / Backblaze B2 en production |
| Transcodage | FFmpeg → HLS multi-résolutions (240p → 4K) |
| Recherche | Meilisearch (repli PostgreSQL automatique) |
| Auth | JWT (access court + refresh rotatif) · OAuth Google optionnel |
| Emails | Nodemailer · Mailpit en développement |

---

## Architecture du monorepo

```
kelvyn-tube/
├── apps/
│   ├── api/                    # Serveur Fastify + workers BullMQ
│   │   └── src/
│   │       ├── config/         # Validation des variables d'environnement
│   │       ├── lib/            # Clients partagés (redis, s3, jwt, queue, realtime, serializers)
│   │       ├── plugins/        # Plugin d'authentification transverse
│   │       ├── modules/        # Un dossier par domaine métier
│   │       │   ├── auth/       # Inscription, connexion, refresh, OAuth, emails
│   │       │   ├── channels/   # Chaînes, personnalisation, assets, communauté
│   │       │   ├── upload/     # Upload resumable par chunks (S3 multipart)
│   │       │   ├── media/      # FFmpeg, transcodage HLS, miniatures
│   │       │   ├── videos/     # CRUD vidéo, tags, chapitres
│   │       │   ├── views/      # Comptage de vues anti-fraude
│   │       │   ├── feed/       # Feed algorithmique et recommandation
│   │       │   ├── social/     # Likes, commentaires, abonnements, notifications
│   │       │   ├── studio/     # Analytics du dashboard créateur
│   │       │   ├── search/     # Recherche full-text et hashtags
│   │       │   ├── library/    # Historique, playlists, à regarder plus tard
│   │       │   └── analytics/  # Jobs d'agrégation et de scoring
│   │       ├── server.ts       # Assemblage Fastify
│   │       ├── ws.ts           # Point d'entrée WebSocket
│   │       └── worker.ts       # Processus workers
│   └── web/                    # Application Next.js
│       └── src/
│           ├── app/            # Routes App Router
│           ├── components/     # Composants applicatifs
│           └── lib/            # Client API, contextes auth et temps réel
├── packages/
│   ├── db/                     # Schéma Prisma, client singleton, seed
│   ├── shared/                 # Contrat partagé : DTO, schémas Zod, routes, formats
│   └── ui/                     # Design system React (composants purs)
├── infra/
│   └── docker-compose.yml      # PostgreSQL, Redis, MinIO, Meilisearch, Mailpit
└── scripts/dev.mjs             # Lanceur de la stack de développement
```

**Principe directeur** : `packages/shared` est le contrat unique entre le frontend et le backend. Les DTO (`dto.ts`), les schémas de validation (`schemas.ts`) et la carte des routes (`routes.ts`) y sont définis une seule fois et consommés des deux côtés — impossible de dériver.

---

## Démarrage rapide

**Prérequis** : Node.js ≥ 20, Docker Desktop. FFmpeg est recommandé mais optionnel (voir [Mode dégradé](#mode-dégradé)).

```bash
git clone <repo> kelvyn-tube && cd kelvyn-tube
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
npm run setup    # install + docker up + prisma generate + db push + seed
npm run dev      # API :4000 · workers · web :3000
```

Ouvre ensuite **http://localhost:3000**.

Installer FFmpeg (optionnel mais recommandé pour tester le transcodage réel) :

```bash
brew install ffmpeg
```

---

## Compte de démonstration

Après `npm run db:seed` :

| Champ | Valeur |
|---|---|
| Email | `kelvyn@kelvyntube.local` |
| Mot de passe | `Demo1234` |

Ce compte possède deux chaînes (pour tester le multi-chaînes), un historique, des playlists, des abonnements et 90 jours d'analytics remplis dans Kelvyn Studio.

---

## Services locaux

| Service | URL | Identifiants |
|---|---|---|
| Frontend | http://localhost:3000 | — |
| API | http://localhost:4000 | — |
| Santé de l'API | http://localhost:4000/api/v1/health | — |
| PostgreSQL | `localhost:5433` | `kelvyn` / `kelvyn` |
| Redis | `localhost:6380` | — |
| MinIO (console) | http://localhost:9001 | `kelvyntube` / `kelvyntube-secret` |
| Meilisearch | http://localhost:7700 | clé `kelvyntube-meili-master-key` |
| Mailpit (emails) | http://localhost:8025 | — |
| Prisma Studio | `npm run db:studio` | — |

---

## Fonctionnalités

**Comptes et chaînes** — inscription email/mot de passe, OAuth Google, vérification d'email, réinitialisation de mot de passe, onboarding (pseudo, centres d'intérêt), multi-chaînes par utilisateur, personnalisation complète (bannière 16:9, avatar circulaire, handle `@`, liens externes), onglets Accueil / Vidéos / Shorts / Playlists / Communauté / À propos, vidéo bande-annonce pour les non-abonnés.

**Vidéos** — upload resumable par chunks (reprise après coupure réseau), transcodage multi-résolutions en HLS, trois miniatures auto-générées + miniature personnalisée, description avec liens et timestamps cliquables, hashtags avec page dédiée et tendances, catégorisation, visibilité publique / non répertoriée / privée / programmée, vidéos longues sans limite de durée et Shorts verticaux, statut de traitement en temps réel.

**Lecture** — lecteur custom HLS avec qualité adaptative, vitesse de lecture, sous-titres, chapitres, mode théâtre, picture-in-picture, plein écran tactile.

**Social** — like/dislike (dislikes visibles du seul créateur), commentaires en fils avec réponses, tri pertinence/récence, épinglage, cœur du créateur, mentions `@`, réactions emoji, modération par mots bloqués ; abonnements avec cloche à trois niveaux ; notifications temps réel par WebSocket.

**Kelvyn Studio** — vue d'ensemble (vues, temps de visionnage, abonnés, revenus estimés), analytics par vidéo (vues dans le temps, sources de trafic, courbe de rétention, CTR, données démographiques, pic d'audience en direct), gestion des vidéos avec édition en masse, modération centralisée des commentaires, analytics des abonnés gagnés/perdus par vidéo.

**Navigation** — feed d'accueil algorithmique avec chips de filtres, page de visionnage avec sidebar de suggestions, feed Shorts vertical en swipe, bibliothèque (historique, à regarder plus tard, likées, playlists), recherche avec autocomplétion et filtres (durée, date, type, tri).

**Interface** — thème sombre par défaut avec bascule clair, aperçu vidéo au survol des cartes, grille responsive de 1 à 6 colonnes, sidebar rétractable, menu hamburger et bottom nav sur mobile.

---

## Pipeline vidéo

```
Upload par chunks  ──▶  S3 multipart  ──▶  file `kt-transcode`
                                              │
                        ┌─────────────────────┴──────────────────────┐
                        ▼                                            ▼
                  ffprobe (durée, dimensions)            détection Short (≤60s + vertical)
                        │
                        ▼
      transcodage HLS par résolution (240p → 2160p, plafonné par MAX_RENDITION)
                        │
                        ├──▶ upload des segments + index.m3u8 par variante
                        ├──▶ master.m3u8 (#EXT-X-STREAM-INF)
                        ├──▶ MP4 de repli 720p
                        ├──▶ clip d'aperçu au survol + sprite de scrubbing
                        └──▶ file `kt-thumbnails` (3 miniatures : 15 % / 45 % / 75 %)
                        │
                        ▼
              status: READY  ──▶  indexation Meilisearch  ──▶  notification aux abonnés
```

La progression est diffusée en direct au créateur via WebSocket (`processing:progress`) à chaque étape.

---

## Système de vues

Le comptage ne fait jamais confiance au client et n'écrit jamais directement en base sur le chemin chaud :

1. Le lecteur envoie un *heartbeat* toutes les ~10 s (`POST /views/heartbeat`).
2. Une vue n'est validée que si le temps de visionnage dépasse `VIEW_MIN_WATCH_SECONDS` **et** qu'aucune vue n'a déjà été comptée pour ce couple (vidéo, session) dans la fenêtre `VIEW_DEDUPE_WINDOW_SECONDS`. La déduplication utilise un `SET NX EX` atomique — pas de lecture-puis-écriture.
3. Les incréments s'accumulent dans des compteurs Redis (`kt:views:buffer`, `kt:watchtime:buffer`, `kt:retention:buffer`, `kt:impressions:buffer`, `kt:clicks:buffer`).
4. Un job répétitif (`flush-views`, toutes les 15 s) draine ces compteurs vers PostgreSQL par transaction, met à jour les agrégats journaliers et recalcule CTR, rétention moyenne et taux d'engagement.

Les adresses IP ne sont jamais stockées en clair — uniquement un `sha256(ip + sel)` tronqué.

---

## Algorithme de distribution

Le score de « chaleur » d'une vidéo combine des signaux de qualité, un amortissement temporel et un bonus de découverte :

- **CTR** de la miniature (`clics / impressions`)
- **Rétention moyenne** (`avgWatchPct`)
- **Taux d'engagement** (`(likes + commentaires) / vues`)
- **Vitesse d'engagement précoce** — vues par heure depuis la publication, qui détecte un potentiel viral
- **Décroissance temporelle** de type Hacker News
- **Boost de découverte** — les vidéos récentes encore peu exposées reçoivent un bonus explicite pour être testées auprès d'une petite audience, puis amplifiées si les signaux sont bons (logique « test & scale »)

Le feed d'accueil mélange ces signaux avec la personnalisation : centres d'intérêt déclarés, historique de visionnage, abonnements, plus une part d'exploration. Le score est recalculé toutes les 5 minutes par le worker `analytics`.

---

## Documentation

- [`docs/API.md`](docs/API.md) — référence REST complète (toutes les routes, corps de requête, réponses)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — décisions d'architecture, modèle de données, mise à l'échelle
- `packages/db/prisma/schema.prisma` — schéma de base de données commenté
- `packages/shared/src/dto.ts` — contrat de réponse de l'API

---

## Commandes utiles

```bash
npm run setup        # Installation complète (deps + docker + db + seed)
npm run dev          # Stack complète en développement
npm run dev:api      # API seule
npm run dev:worker   # Workers seuls
npm run dev:web      # Frontend seul

npm run infra:up     # Démarre PostgreSQL, Redis, MinIO, Meilisearch, Mailpit
npm run infra:down   # Arrête l'infrastructure
npm run infra:logs   # Suit les logs des conteneurs

npm run db:push      # Applique le schéma Prisma (développement)
npm run db:migrate   # Crée une migration (production)
npm run db:seed      # Réinjecte les données de démonstration
npm run db:studio    # Explorateur de base de données

npm run search:reindex  # Reconstruit l'index Meilisearch depuis PostgreSQL
                        # (indispensable après un db:seed — le seed écrit
                        #  directement en base sans passer par l'API)

npm run typecheck    # Vérification TypeScript de tous les workspaces
npm run build        # Build de production
```

---

## Mode dégradé

Le projet reste utilisable même sans toutes les dépendances système :

| Composant absent | Conséquence |
|---|---|
| **FFmpeg** | Le transcodage HLS est ignoré ; la vidéo source est servie telle quelle en MP4 et la vidéo passe quand même en `READY`. Un avertissement est enregistré dans `processingError`. |
| **Meilisearch** | La recherche bascule automatiquement sur PostgreSQL (`ILIKE` + tri par pertinence/vues). |
| **Google OAuth** | Les routes OAuth renvoient 501 et le bouton correspondant est masqué ; l'authentification email/mot de passe reste entière. |
| **SMTP** | Les emails échouent proprement dans la file sans bloquer l'inscription. En développement, Mailpit capture tout. |

PostgreSQL et Redis, en revanche, sont indispensables.
