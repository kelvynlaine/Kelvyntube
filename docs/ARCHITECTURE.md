# Architecture — Kelvyn Tube

Ce document explique **pourquoi** le projet est structuré ainsi, et comment il tiendrait la montée en charge. Pour la référence des endpoints, voir [`API.md`](API.md).

---

## 1. Principe directeur : un contrat, deux consommateurs

Le risque principal d'un projet full-stack de cette taille est la dérive entre ce que l'API renvoie et ce que le frontend attend. `packages/shared` élimine cette classe de bugs :

| Fichier | Rôle | Consommé par |
|---|---|---|
| `dto.ts` | Formes de réponse (types TypeScript) | API (retours) + Web (props, hooks) |
| `schemas.ts` | Validation des requêtes (Zod) | API (`schema.parse`) + Web (formulaires) |
| `routes.ts` | Carte des chemins REST | API (déclaration) + Web (appels) |
| `constants.ts` | Résolutions, clés Redis, noms de files, événements WS | API + workers + Web |
| `format.ts` | Formats d'affichage (vues, durées, dates relatives) | Web + design system |

Un changement de contrat casse la compilation des deux côtés simultanément — c'est voulu.

Le même principe s'applique en interne à l'API : `lib/serializers.ts` centralise les mappers Prisma → DTO, si bien qu'aucun module ne construit une `VideoCardDTO` à la main.

---

## 2. Découpage en modules

L'API est découpée par **domaine métier**, pas par couche technique. Chaque module possède ses routes, ses services et, le cas échéant, son worker :

```
modules/<domaine>/
  <domaine>.routes.ts     # déclaration Fastify, validation Zod, codes HTTP
  <domaine>.service.ts    # logique métier, accès Prisma
  <domaine>.mapper.ts     # Prisma -> DTO spécifiques au domaine
  <domaine>.worker.ts     # traitement asynchrone (optionnel)
```

`modules/index.ts` est le **seul** point de couplage : il importe la fonction `register…Routes` de chaque module. Cette contrainte a rendu possible le développement simultané de tous les modules par des agents distincts, sans conflit d'édition.

Les préoccupations transverses vivent en dehors des modules :

| Fichier | Responsabilité |
|---|---|
| `plugins/auth.ts` | Décode le token sur chaque requête, expose `app.authenticate`, `app.optionalAuth`, `app.assertChannelOwner` |
| `lib/errors.ts` | Hiérarchie d'erreurs typées + handler unique ; aucune route ne construit de réponse d'erreur à la main |
| `lib/redis.ts` | Connexions Redis distinctes pour les commandes, la publication et l'abonnement |
| `lib/storage.ts` | Abstraction S3 (MinIO ↔ R2 ↔ B2) et conventions de nommage des clés |
| `lib/queue.ts` | Producteurs BullMQ et contrats de payload des jobs |
| `lib/realtime.ts` | Hub WebSocket avec fan-out Redis |

---

## 3. Modèle de données

### Choix structurants

**Compteurs dénormalisés.** `Video.viewCount`, `Channel.subscriberCount`, `Comment.likeCount` sont stockés en dur plutôt que recalculés. Une page de visionnage ne peut pas se permettre un `COUNT(*)` sur une table de plusieurs milliards de lignes. Les compteurs à faible fréquence (likes, abonnements) sont mis à jour dans la même transaction que l'écriture qui les provoque ; ceux à très haute fréquence (vues) passent par Redis (section 5).

**Likes polymorphes.** Une seule table `likes` avec `(targetType, targetId)` plutôt que `video_likes` + `comment_likes`. La contrainte `@@unique([userId, targetType, targetId])` garantit l'unicité et l'index `[targetType, targetId]` sert les lectures. Le champ `value` (`1` / `-1`) évite une table séparée pour les dislikes.

**Séparation log / agrégat.** `View` est un journal détaillé (une ligne par vue validée, pour l'analyse démographique et les sources de trafic) ; `VideoStatDaily` et `ChannelStatDaily` sont des agrégats pré-calculés qui alimentent le Studio. Le dashboard ne lit jamais la table de log directement — il lirait des millions de lignes.

**Rétention en buckets.** `RetentionPoint` stocke 100 points par vidéo (un par centième de la durée) plutôt qu'une valeur par seconde : la courbe reste lisible pour une vidéo de 10 s comme pour une de 3 h, et le volume est borné.

**Suppressions logiques.** `Video.deletedAt` et `Comment.deletedAt` préservent l'intégrité référentielle des statistiques historiques et des fils de discussion.

**Confidentialité.** Aucune adresse IP n'est stockée en clair : `View.ipHash` contient un `sha256(ip + sel)` tronqué, suffisant pour la déduplication et la détection d'abus, insuffisant pour ré-identifier.

### Cycles de vie

```
Vidéo :   UPLOADING ─▶ UPLOADED ─▶ PROCESSING ─▶ READY
                                        └──────▶ FAILED

Visibilité : PRIVATE ⇄ UNLISTED ⇄ PUBLIC
                 └─▶ SCHEDULED ──(publishAt atteint)──▶ PUBLIC
```

---

## 4. Pipeline vidéo

### Upload resumable

Un upload de plusieurs gigaoctets ne peut pas dépendre d'une connexion stable. Le découpage en chunks de 8 Mo, adossé au multipart S3, permet de reprendre exactement là où la coupure a eu lieu :

```
POST /upload/init      ──▶ crée Video + UploadSession + multipart S3
PUT  /upload/:id/chunk/:n ──▶ UploadPart (idempotent, ordre libre)
GET  /upload/:id/status   ──▶ receivedChunks[]  ← le client compare et renvoie les manquants
POST /upload/:id/complete ──▶ CompleteMultipartUpload + enfile le transcodage
```

L'état vit en base (`UploadSession.receivedChunks`, `parts`) et non en mémoire : un redémarrage de l'API ne perd pas un upload en cours.

### Transcodage

Le transcodage est *toujours* asynchrone — la requête HTTP se termine dès que le fichier est sur S3. Le worker produit une échelle de résolutions (bornée par la hauteur source et par `MAX_RENDITION`), un master playlist HLS pour la qualité adaptative, un MP4 de repli, un clip d'aperçu au survol et une sprite de scrubbing.

La progression remonte au créateur en direct par WebSocket. C'est ce qui permet au Studio d'afficher « upload → transcodage → prêt » sans polling.

**Décision assumée** : le pipeline détecte l'absence de FFmpeg et bascule en mode dégradé (source servie telle quelle, vidéo tout de même `READY`) plutôt que d'échouer. Un projet qu'on ne peut pas lancer sans installer FFmpeg est un projet qu'on ne lance pas.

---

## 5. Système de vues

C'est le chemin le plus chaud de la plateforme, et celui où une implémentation naïve casse en premier.

### Ce qui est refusé

- Incrémenter un compteur en base à chaque lecture — verrous en écriture sur les lignes populaires.
- Faire confiance au client — un `POST /view` déclenché par le navigateur se falsifie en une ligne de console.
- Compter à l'ouverture de la page — le rechargement en boucle gonflerait les compteurs.

### Ce qui est fait

```
Lecteur ──heartbeat (~10 s)──▶ API
                                │
                                ├─ watchedSec ≥ seuil ?            ─ non ─▶ pas de vue
                                ├─ SET NX EX dedupe(video,session) ─ échec ─▶ pas de vue
                                │
                                ▼
                        Redis : HINCRBY viewBuffer / watchTimeBuffer /
                                retentionBuffer / impressionBuffer / clickBuffer
                                │
                        (job répétitif, 15 s)
                                ▼
                        PostgreSQL : Video.viewCount, VideoStatDaily,
                                     RetentionPoint, CTR, rétention moyenne
```

Le verrou de déduplication est un `SET NX EX` **atomique** : une séquence `GET` puis `SET` laisserait passer les vues en cas de requêtes concurrentes, ce qui est précisément le cas d'usage d'un bot.

Le temps de visionnage, les impressions et les clics sont accumulés indépendamment de la validation d'une vue — le CTR et la rétention restent mesurables même sur les vidéos qu'on ne regarde pas assez longtemps pour compter une vue.

---

## 6. Algorithme de distribution

L'objectif affiché est de **maximiser la portée organique** : une bonne vidéo d'une petite chaîne doit pouvoir percer.

### Score de chaleur

Le score combine trois familles de signaux :

**Qualité perçue** — CTR de la miniature (`clics / impressions`), rétention moyenne (`avgWatchPct`), taux d'engagement (`(likes + commentaires) / vues`). Ce sont des *ratios*, pas des volumes : une vidéo à 500 vues avec 60 % de rétention bat une vidéo à 50 000 vues avec 8 %.

**Dynamique temporelle** — la vitesse d'engagement précoce (vues par heure depuis la publication) détecte le potentiel viral avant que les volumes absolus ne soient significatifs. Une décroissance de type Hacker News (`1 / (heures + 2)^1.4`) empêche les anciens succès de saturer le feed indéfiniment.

**Exploration** — les vidéos récentes encore peu exposées reçoivent un bonus explicite. Sans ce terme, l'algorithme est un système à rétroaction positive : ce qui est déjà vu est recommandé, donc revu. Le bonus force une phase de « test » auprès d'une petite audience ; si les ratios tiennent, la décroissance naturelle du bonus est compensée par la hausse du score de qualité, et la vidéo « scale ».

### Composition du feed

| Part | Source |
|---|---|
| 40 % | Personnalisé — centres d'intérêt déclarés, catégories de l'historique récent, chaînes proches des abonnements |
| 30 % | Tendances par score de chaleur |
| 20 % | Nouveautés non vues des chaînes suivies |
| 10 % | Exploration — vidéos récentes peu exposées |

Filtres appliqués ensuite : exclusion des vidéos vues à plus de 90 %, exclusion des vidéos de l'utilisateur, déduplication stricte, maximum deux vidéos par chaîne et par page. Un visiteur anonyme ne reçoit que les blocs tendances et nouveautés.

Le résultat est mis en cache 60 s par couple (utilisateur, catégorie) : assez court pour rester vivant, assez long pour absorber le rafraîchissement compulsif.

---

## 7. Temps réel

Un seul point d'entrée WebSocket (`/ws`), un modèle de rooms (`user:<id>`, `video:<id>`, `channel:<id>`), et un fan-out par Redis Pub/Sub.

Le passage par Redis n'est pas gratuit en latence, mais il est nécessaire : avec plusieurs instances d'API derrière un répartiteur, l'utilisateur qui reçoit la notification n'est presque jamais connecté à l'instance qui l'a produite. Diffuser uniquement aux sockets locaux perdrait silencieusement la majorité des messages.

Les rooms `video:` et `channel:` sont librement rejoignables (leur contenu est public) ; la room `user:` exige un token valide.

---

## 8. Traitement asynchrone

Six files BullMQ, chacune avec sa concurrence propre. Le transcodage est limité (`TRANSCODE_CONCURRENCY`, 2 par défaut) parce qu'il sature le CPU ; les notifications tournent à 8 en parallèle parce qu'elles sont dominées par l'attente d'entrées-sorties.

Les jobs répétitifs portent un `jobId` fixe (`repeat:flush-views`…) : redémarrer le worker ne crée pas de doublon de planification.

**Idempotence** : `rollup-daily` fait des `upsert` par `(videoId, date)`, `publish-scheduled` filtre sur `publishAt <= now AND status = READY`, `flush-views` réinjecte les compteurs dans Redis si l'écriture PostgreSQL échoue. Rejouer un job ne corrompt jamais les données.

---

## 9. Sécurité

| Sujet | Traitement |
|---|---|
| Mots de passe | argon2id, jamais de hash réversible |
| Refresh tokens | Stockés en `sha256`, jamais en clair ; rotation à chaque usage ; la réutilisation d'un token révoqué invalide toute la famille (détection de vol) |
| Cookies | `httpOnly`, `sameSite=lax`, `secure` en production, chemin restreint pour le refresh |
| Access token | Court (15 min), gardé **en mémoire** côté client — jamais dans `localStorage`, hors de portée d'un XSS |
| Injection SQL | Requêtes brutes uniquement via `Prisma.sql` paramétré ; aucune interpolation de chaîne |
| Uploads d'images | Type MIME vérifié **puis** format réel confirmé par décodage ; SVG refusé (XML scriptable) ; limite de pixels contre les bombes de décompression ; métadonnées EXIF supprimées (dont la géolocalisation) |
| Énumération de comptes | `password/request-reset` répond `204` que l'email existe ou non |
| Autorisation | `assertChannelOwner` sur toute écriture liée à une chaîne ; la propriété est vérifiée en base, jamais déduite du token seul |
| Rate limiting | Adossé à Redis, par utilisateur authentifié sinon par IP ; quotas renforcés sur la connexion et les écritures |
| Données personnelles | Adresses IP hachées et salées, jamais stockées en clair |

---

## 10. Mise à l'échelle

Ce qui est déjà en place structurellement :

- **API sans état** — l'authentification est portée par le token, les sessions de vues par Redis. On ajoute des instances derrière un répartiteur sans configuration supplémentaire.
- **Workers séparés** — le transcodage ne peut pas ralentir les requêtes HTTP, et se dimensionne indépendamment.
- **Chemin chaud en mémoire** — le comptage de vues n'écrit jamais en base sur le chemin critique.
- **Stockage objet + CDN** — la diffusion vidéo ne passe pas par l'API ; les URLs sont servies par le CDN avec un cache immuable (les clés sont content-addressées, un changement d'asset change la clé).
- **Streaming adaptatif** — HLS déplace l'arbitrage de qualité chez le client, ce qui réduit la bande passante servie sur les connexions faibles.
- **Index de recherche externalisé** — la recherche full-text ne charge pas la base transactionnelle.

Les étapes suivantes, non implémentées ici mais rendues possibles par ce découpage : partitionnement de `views` par date, réplicas en lecture pour les feeds et le Studio, et remplacement des agrégats journaliers par une base orientée séries temporelles si le volume l'exigeait.

---

## 11. Frontend

**App Router de Next.js** — les pages majoritairement statiques (chaîne, hashtag, résultats) sont rendues côté serveur pour le référencement et le premier affichage ; les surfaces interactives (lecteur, commentaires, Studio) sont des composants client.

**Design system isolé** — `packages/ui` ne contient que des composants **purs** : props et callbacks, aucun appel réseau, aucun import de `next/*`, aucun store. Ils sont testables et réutilisables, et les pages restent responsables de la donnée. La navigation passe par une prop `linkComponent` pour que le package ne dépende pas du routeur.

**Thème** — piloté par des variables CSS sur `data-theme`, avec le sombre par défaut. Aucun composant ne code une couleur en dur : tout passe par les tokens Tailwind (`bg-bg-elevated`, `text-fg-muted`…), ce qui garantit que les deux thèmes restent cohérents.

**Responsive** — la grille passe de 1 à 6 colonnes par points de rupture dédiés (`feed-2` … `feed-6`) plutôt que par les breakpoints génériques, parce que la densité de cartes vidéo ne suit pas les mêmes seuils que le reste de la mise en page. Sur mobile, la sidebar devient un menu hamburger et une barre de navigation basse apparaît.

**Données** — React Query pour le cache, l'invalidation et la pagination infinie ; un client API unique qui gère le refresh transparent des tokens et l'inclusion des cookies.
