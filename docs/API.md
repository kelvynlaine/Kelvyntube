# API REST — Kelvyn Tube

Base : `http://localhost:4000/api/v1`

Toutes les routes sont déclarées dans [`packages/shared/src/routes.ts`](../packages/shared/src/routes.ts), validées par les schémas Zod de [`schemas.ts`](../packages/shared/src/schemas.ts) et retournent les formes définies dans [`dto.ts`](../packages/shared/src/dto.ts). Ces trois fichiers font foi — cette page les documente.

---

## Conventions

### Authentification

| Élément | Détail |
|---|---|
| Access token | JWT court (15 min), envoyé en `Authorization: Bearer <token>` ou via le cookie `kt_access` |
| Refresh token | JWT long (30 j), cookie `httpOnly` `kt_refresh` limité au chemin `/api/v1/auth` |
| Rotation | Chaque `POST /auth/refresh` révoque l'ancien token et en émet un nouveau dans la même famille |
| Réutilisation | Un refresh token déjà révoqué invalide **toute la famille** et renvoie `401` |
| Session anonyme | Cookie `kt_session` (UUID) — sert à la déduplication des vues, jamais à l'authentification |

Trois niveaux d'accès sont utilisés dans les tableaux ci-dessous :

- **public** — aucune authentification
- **optionnel** — la réponse s'enrichit si l'appelant est connecté (bloc `viewer`)
- **auth** — 401 sans token valide ; **auth+** indique une vérification de propriété supplémentaire

### Format d'erreur

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Données invalides",
    "details": { "email": ["Email invalide"] }   // optionnel
  }
}
```

| Code HTTP | `code` | Signification |
|---|---|---|
| 400 | `BAD_REQUEST` | Requête malformée |
| 401 | `UNAUTHORIZED` | Token absent, expiré ou invalide |
| 403 | `FORBIDDEN` | Authentifié mais non autorisé |
| 404 | `NOT_FOUND` | Ressource inexistante ou non visible |
| 409 | `CONFLICT` | Doublon (email, handle) |
| 422 | `VALIDATION_ERROR` | Échec de validation Zod, avec `details` par champ |
| 429 | `TOO_MANY_REQUESTS` | Quota dépassé |
| 500 | `INTERNAL_ERROR` | Erreur serveur |

### Pagination

**Par curseur** (feeds, commentaires, listes infinies) — paramètres `?cursor=<opaque>&limit=24` (max 50) :

```jsonc
{ "items": [ /* … */ ], "nextCursor": "eyJpZCI6…", "hasMore": true }
```

**Par offset** (tableaux du Studio) — paramètres `?page=1&pageSize=25` :

```jsonc
{ "items": [ /* … */ ], "total": 137, "page": 1, "pageSize": 25, "totalPages": 6 }
```

### Types de date

Toutes les dates sont des chaînes ISO 8601 en UTC. Les points de séries journalières utilisent le format court `YYYY-MM-DD`.

---

## Santé

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/health` | public | État de l'API, de PostgreSQL et de Redis |

---

## Authentification — `/auth`

| Méthode | Route | Accès | Corps / Query | Réponse |
|---|---|---|---|---|
| `POST` | `/auth/register` | public | `{ email, password, displayName }` | `AuthResponseDTO` |
| `POST` | `/auth/login` | public | `{ email, password }` | `AuthResponseDTO` |
| `POST` | `/auth/refresh` | cookie | — | `AuthResponseDTO` |
| `POST` | `/auth/logout` | auth | — | `204` |
| `GET` | `/auth/me` | auth | — | `AuthUserDTO` |
| `POST` | `/auth/verify-email` | public | `{ token }` | `204` |
| `POST` | `/auth/resend-verification` | auth | — | `204` |
| `POST` | `/auth/password/request-reset` | public | `{ email }` | `204` |
| `POST` | `/auth/password/reset` | public | `{ token, password }` | `204` |
| `POST` | `/auth/onboarding` | auth | `{ handle, displayName, interests[] }` | `AuthResponseDTO` |
| `PATCH` | `/auth/profile` | auth | `{ displayName?, avatarUrl?, theme?, autoplay?, interests?, locale? }` | `AuthUserDTO` |
| `POST` | `/auth/channels/:channelId/activate` | auth+ | — | `AuthResponseDTO` |
| `GET` | `/auth/oauth/google` | public | — | Redirection Google |
| `GET` | `/auth/oauth/google/callback` | public | `?code&state` | Redirection vers le front |

**Contraintes de mot de passe** : 8 caractères minimum, au moins une minuscule, une majuscule et un chiffre.

**Onboarding** : crée la première chaîne de l'utilisateur avec le handle choisi, enregistre les centres d'intérêt qui amorcent l'algorithme de recommandation, et réémet un access token contenant l'identifiant de chaîne active.

**OAuth Google** : si `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ne sont pas configurés, ces deux routes renvoient `501` et le frontend masque le bouton.

---

## Chaînes — `/channels`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/channels` | public | Annuaire paginé, trié par nombre d'abonnés |
| `GET` | `/channels/handle/:handle` | optionnel | Chaîne par handle (sans le `@`) → `ChannelDTO` |
| `GET` | `/channels/:id` | optionnel | Chaîne par identifiant → `ChannelDTO` |
| `GET` | `/channels/mine` | auth | Chaînes possédées → `ChannelSummaryDTO[]` |
| `POST` | `/channels` | auth | Crée une chaîne supplémentaire (5 max) |
| `PATCH` | `/channels/:id` | auth+ | Nom, handle, description, liens, localisation, bannière, avatar, bande-annonce, mots bloqués |
| `GET` | `/channels/check-handle` | public | `?handle=` → `{ available, suggestions[] }` |
| `GET` | `/channels/:id/home` | optionnel | Onglet Accueil : bande-annonce + sections |
| `GET` | `/channels/:id/videos` | optionnel | `?sort=recent\|popular\|oldest` → `CursorPage<VideoCardDTO>` |
| `GET` | `/channels/:id/shorts` | optionnel | Shorts de la chaîne |
| `GET` | `/channels/:id/playlists` | optionnel | Playlists publiques |
| `GET` | `/channels/:id/posts` | optionnel | Onglet Communauté |
| `POST` | `/channels/:id/posts` | auth+ | Publie un post communauté |
| `POST` | `/channels/:id/assets` | auth+ | `multipart` `?type=avatar\|banner` → `{ url }` |
| `POST` | `/channels/:id/subscribe` | auth | `{ level }` — s'abonner |
| `DELETE` | `/channels/:id/subscribe` | auth | Se désabonner |

**Traitement des assets** : l'avatar est recadré en carré centré 800×800, la bannière au ratio 16:9 en 2560×1440, les deux en JPEG qualité 85. Les fichiers non-image sont refusés (`415`), au-delà de 15 Mo également (`413`).

**Bande-annonce** : la vidéo `trailerVideoId` n'est renvoyée par `/channels/:id/home` que si le visiteur n'est pas abonné — comportement identique à YouTube.

---

## Upload — `/upload`

Upload resumable par chunks, adossé au multipart S3.

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `POST` | `/upload/init` | auth | `{ fileName, fileSizeBytes, mimeType, chunkSizeBytes? }` → `UploadInitDTO` |
| `PUT` | `/upload/:uploadId/chunk/:index` | auth+ | Envoie le chunk `index` (0-indexé) → `UploadStatusDTO` |
| `GET` | `/upload/:uploadId/status` | auth+ | → `UploadStatusDTO` (liste des chunks déjà reçus) |
| `POST` | `/upload/:uploadId/complete` | auth+ | Finalise et déclenche le transcodage |
| `DELETE` | `/upload/:uploadId` | auth+ | Abandonne l'upload et supprime la vidéo |

**Reprise après coupure réseau** : le client appelle `GET /status`, compare `receivedChunks` à ce qu'il a envoyé, et ne renvoie que les chunks manquants. Les chunks peuvent arriver dans le désordre et le renvoi d'un chunk déjà reçu est idempotent.

**Taille de chunk** : 8 Mo par défaut (`UPLOAD_CHUNK_SIZE`), minimum 5 Mo imposé par S3.

**Cycle de vie de la vidéo** :

```
UPLOADING ──▶ UPLOADED ──▶ PROCESSING ──▶ READY
                                └────────▶ FAILED
```

---

## Vidéos — `/videos`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/videos/:id` | optionnel | → `VideoDetailDTO` |
| `PATCH` | `/videos/:id` | auth+ | Titre, description, catégorie, tags, visibilité, programmation, chapitres, miniature, options |
| `DELETE` | `/videos/:id` | auth+ | Suppression logique |
| `POST` | `/videos/bulk` | auth+ | Édition en masse (visibilité, catégorie, tags, commentaires) |
| `PUT` | `/videos/:id/thumbnail` | auth+ | `multipart` — miniature personnalisée (1280×720) |
| `GET` | `/videos/:id/related` | optionnel | Suggestions de la sidebar → `CursorPage<VideoCardDTO>` |
| `POST` | `/videos/:id/like` | auth | `{ value: 1 \| -1 \| 0 }` |

**Visibilité** : une vidéo `PRIVATE` renvoie `404` à quiconque n'en est pas propriétaire. Une vidéo `UNLISTED` est accessible par lien direct mais n'apparaît dans aucun feed ni résultat de recherche. Une vidéo `SCHEDULED` bascule automatiquement en `PUBLIC` quand `publishAt` est atteint (job répétitif `publish-scheduled`, toutes les minutes).

**Dislikes** : `dislikeCount` vaut `null` pour tout le monde sauf le propriétaire de la chaîne — comportement YouTube actuel.

**Chapitres** : s'ils ne sont pas définis explicitement, ils sont dérivés de la description (lignes préfixées d'un timestamp). Le premier chapitre doit être à `0:00` pour que la liste soit considérée comme valide.

---

## Vues et signaux — `/views`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `POST` | `/views/heartbeat` | optionnel | Ping du lecteur → `{ counted, viewCount }` |
| `POST` | `/views/impressions` | optionnel | Batch de miniatures affichées (CTR) |
| `POST` | `/views/click` | optionnel | Clic sur une miniature (CTR) |
| `GET` | `/views/:videoId/live` | public | → `{ liveViewers }` |

**Corps du heartbeat** :

```jsonc
{
  "videoId": "clx…",
  "sessionId": "6f1c…",       // identifiant de session anonyme
  "watchedSec": 42,           // temps cumulé sur cette session
  "positionSec": 128,         // position courante dans la vidéo
  "source": "HOME"            // HOME | SEARCH | SUGGESTED | CHANNEL | EXTERNAL | PLAYLIST | SHORTS | NOTIFICATION | DIRECT
}
```

**Règles anti-fraude** — une vue n'est comptée que si :

1. `watchedSec >= VIEW_MIN_WATCH_SECONDS` (5 s par défaut) ;
2. aucune vue n'a déjà été comptée pour ce couple (vidéo, session) dans les `VIEW_DEDUPE_WINDOW_SECONDS` (30 min par défaut) — verrou posé par un `SET NX EX` atomique.

Le temps de visionnage, les impressions, les clics et la rétention sont accumulés indépendamment, même quand aucune nouvelle vue n'est validée. Tout transite par Redis puis est drainé vers PostgreSQL toutes les 15 s.

---

## Feed — `/feed`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/feed/home` | optionnel | `?category=all&cursor=&limit=` → `HomeFeedDTO` |
| `GET` | `/feed/trending` | public | Tendances globales |
| `GET` | `/feed/shorts` | optionnel | `?seedVideoId=` → feed Shorts vertical |
| `GET` | `/feed/categories` | public | → `CategoryDTO[]` (chips de filtres) |

**Composition du feed d'accueil** pour un utilisateur connecté : 40 % personnalisé (centres d'intérêt, historique, chaînes proches des abonnements), 30 % tendances par score de chaleur, 20 % nouveautés non vues des chaînes suivies, 10 % exploration de vidéos récentes peu exposées. Les vidéos vues à plus de 90 % sont exclues, la déduplication est stricte et une même chaîne n'apparaît pas plus de deux fois par page. Pour un visiteur anonyme, seuls les blocs tendances et nouveautés sont utilisés. Le résultat est mis en cache 60 s par couple (utilisateur, catégorie).

---

## Social

### Commentaires

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/videos/:id/comments` | optionnel | `?sort=top\|newest` → `CursorPage<CommentDTO>` |
| `POST` | `/videos/:id/comments` | auth | `{ text, parentId? }` |
| `GET` | `/comments/:id/replies` | optionnel | Réponses d'un fil |
| `PATCH` | `/comments/:id` | auth (auteur) | `{ text }` |
| `DELETE` | `/comments/:id` | auth (auteur, propriétaire, modérateur) | Suppression logique |
| `POST` | `/comments/:id/like` | auth | `{ value: 1 \| -1 \| 0 }` |
| `POST` | `/comments/:id/pin` | auth+ | Épingle (un seul par vidéo) |
| `POST` | `/comments/:id/heart` | auth+ | Cœur du créateur |
| `POST` | `/comments/:id/reactions` | auth | `{ emoji }` — bascule |
| `GET` | `/studio/:channelId/comments` | auth+ | Modération centralisée, `?filter=all\|unanswered\|held&q=` |

Les commentaires racines épinglés remontent en tête. Jusqu'à trois réponses sont préchargées dans `replies`. Le tri `top` classe par nombre de likes puis par date.

**Modération** : les mots bloqués de la chaîne (`Channel.blockedWords`) sont comparés sur des mots entiers, sans accents et en minuscules, pour éviter les faux positifs. Une heuristique anti-spam (liens répétés, majuscules excessives) met le commentaire en attente plutôt que de le refuser.

### Abonnements

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/subscriptions` | auth | → `SubscriptionDTO[]` avec `unseenCount` |
| `GET` | `/subscriptions/feed` | auth | Vidéos des chaînes suivies → `CursorPage<VideoCardDTO>` |
| `PATCH` | `/subscriptions/:channelId/level` | auth | `{ level: "ALL" \| "PERSONALIZED" \| "NONE" }` |

### Notifications

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/notifications` | auth | → `CursorPage<NotificationDTO>` |
| `GET` | `/notifications/unread-count` | auth | → `{ count }` |
| `POST` | `/notifications/:id/read` | auth | Marque comme lue |
| `POST` | `/notifications/read-all` | auth | Marque tout comme lu |

**Fan-out** : à la publication d'une vidéo, les abonnés au niveau `ALL` sont tous notifiés ; ceux au niveau `PERSONALIZED` ne le sont que s'ils ont regardé une vidéo de la chaîne dans les 90 derniers jours ; le niveau `NONE` est ignoré. Le traitement se fait par lots de 500 pour tenir sur les chaînes à forte audience.

---

## Recherche et hashtags

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/search` | optionnel | Recherche full-text → `SearchResultsDTO` |
| `GET` | `/search/suggest` | public | `?q=` → `SearchSuggestionDTO[]` (autocomplétion) |
| `GET` | `/tags/trending` | public | Top 20 hashtags tendances |
| `GET` | `/tags/:name` | public | En-tête de la page hashtag |
| `GET` | `/tags/:name/videos` | public | `?sort=recent\|popular` |
| `GET` | `/tags/suggest` | public | `?q=` — suggestions à l'upload |

**Filtres de recherche** :

| Paramètre | Valeurs |
|---|---|
| `duration` | `any` · `short` (< 4 min) · `medium` (4–20 min) · `long` (> 20 min) |
| `uploadDate` | `any` · `hour` · `today` · `week` · `month` · `year` |
| `type` | `all` · `video` · `channel` · `playlist` · `short` |
| `sort` | `relevance` · `date` · `views` · `rating` |

Si Meilisearch est indisponible, la recherche bascule automatiquement sur PostgreSQL sans erreur visible côté client.

---

## Bibliothèque et playlists

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/library/history` | auth | Historique → `CursorPage<VideoCardDTO + progression>` |
| `DELETE` | `/library/history` | auth | Efface tout, ou une entrée avec `?videoId=` |
| `GET` | `/library/liked` | auth | Vidéos likées |
| `GET` | `/library/watch-later` | auth | À regarder plus tard |
| `GET` | `/playlists` | auth | Playlists de l'utilisateur |
| `POST` | `/playlists` | auth | `{ title, description?, visibility?, videoId? }` |
| `GET` | `/playlists/:id` | optionnel | → `PlaylistDetailDTO` |
| `PATCH` | `/playlists/:id` | auth+ | Titre, description, visibilité |
| `DELETE` | `/playlists/:id` | auth+ | Supprime (interdit sur les playlists système) |
| `POST` | `/playlists/:id/items` | auth+ | `{ videoId }` — ajoute en fin de liste |
| `DELETE` | `/playlists/:id/items/:videoId` | auth+ | Retire et recompacte les positions |
| `POST` | `/playlists/:id/reorder` | auth+ | `{ videoId, position }` |

Deux playlists système sont créées automatiquement pour chaque utilisateur : `WATCH_LATER` et `LIKED`. Elles ne peuvent pas être supprimées.

---

## Kelvyn Studio — `/studio`

Toutes ces routes exigent d'être authentifié **et** propriétaire de la chaîne.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/studio/:channelId/overview` | → `StudioOverviewDTO` |
| `GET` | `/studio/:channelId/videos` | Tableau de gestion → `OffsetPage<StudioVideoRowDTO>` |
| `GET` | `/studio/:channelId/videos/:videoId/analytics` | → `VideoAnalyticsDTO` |
| `GET` | `/studio/:channelId/subscribers` | Abonnés gagnés/perdus, par vidéo |
| `GET` | `/studio/:channelId/realtime` | Audience en direct |
| `GET` | `/studio/:channelId/comments` | Modération centralisée |

**Plage de dates** : `?preset=7d|28d|90d|365d|lifetime`, ou `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Les séries temporelles comblent les jours sans données avec des zéros pour que les courbes restent continues.

**Courbe de rétention** : 100 points correspondant aux centièmes de la vidéo, normalisés par rapport au bucket 0 (`pct = plays[n] / plays[0] × 100`).

**Revenus estimés** : il n'y a pas de monétisation réelle. La valeur est une simulation basée sur un RPM par catégorie, et vaut zéro tant que `monetizationEnabled` est faux sur la chaîne.

---

## WebSocket — `/ws`

Connexion : `ws://localhost:4000/ws?token=<accessToken>` (le token est optionnel — sans lui, seules les rooms publiques sont accessibles).

### Client → serveur

```jsonc
{ "type": "auth", "token": "<accessToken>" }
{ "type": "subscribe", "room": "video:<videoId>" }
{ "type": "unsubscribe", "room": "channel:<channelId>" }
{ "type": "ping" }
```

### Serveur → client

```jsonc
{ "event": "<nom>", "data": { /* … */ } }
```

| Événement | Room | Charge utile |
|---|---|---|
| `notification` | `user:<id>` | `NotificationDTO` |
| `processing:progress` | `video:<id>` | `{ videoId, progress, status }` |
| `video:viewcount` | `video:<id>` | `{ videoId, viewCount }` |
| `video:liveviewers` | `video:<id>` | `{ videoId, liveViewers }` |
| `comment:created` | `video:<id>` | `CommentDTO` |
| `channel:subscribers` | `channel:<id>` | `{ channelId, subscriberCount }` |

Le fan-out passe par Redis Pub/Sub, ce qui rend la diffusion correcte même avec plusieurs instances d'API derrière un répartiteur de charge. La room `user:<id>` n'est rejoignable qu'après authentification.

---

## Files d'attente

| File | Déclencheur | Rôle |
|---|---|---|
| `kt-transcode` | Fin d'upload | Transcodage HLS multi-résolutions |
| `kt-thumbnails` | Fin de transcodage | Extraction des 3 miniatures candidates |
| `kt-search-index` | Création / modification / suppression | Indexation Meilisearch |
| `kt-notifications` | Événements sociaux | Création et diffusion des notifications |
| `kt-analytics` | Répétitif | Agrégats, scoring, publication programmée |
| `kt-email` | Inscription, réinitialisation | Envoi SMTP |

**Jobs répétitifs** de la file `kt-analytics` :

| Job | Fréquence | Rôle |
|---|---|---|
| `flush-views` | 15 s | Draine les compteurs Redis vers PostgreSQL |
| `rollup-daily` | 10 min | Consolide les agrégats journaliers par vidéo et par chaîne |
| `recompute-hot-scores` | 5 min | Recalcule le score de distribution |
| `refresh-trending-tags` | 15 min | Recalcule les hashtags tendances |
| `publish-scheduled` | 1 min | Publie les vidéos programmées arrivées à échéance |
