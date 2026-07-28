import { prisma } from '@kelvyntube/db';
import { extractHashtags, normalizeTag, type TagDTO } from '@kelvyntube/shared';
import { toTagDTO } from '../../lib/serializers.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TAGS / HASHTAGS
 *  Source des tags d'une vidéo (par ordre de priorité) :
 *    1. les tags explicites saisis dans le Studio ;
 *    2. les hashtags présents dans le TITRE (affichés au-dessus du titre) ;
 *    3. les hashtags présents dans la DESCRIPTION.
 *  Les 3 premiers (`position` 0..2) sont ceux que le front affiche.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nombre maximum de tags conservés pour une vidéo (YouTube ≈ 15-20). */
export const MAX_TAGS_PER_VIDEO = 20;

/**
 * Fusionne + normalise toutes les sources de tags.
 * Exportée séparément pour rester testable sans base de données.
 */
export function mergeTagSources(
  rawTags: string[] | undefined | null,
  description?: string | null,
  title?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: string) => {
    const name = normalizeTag(candidate);
    if (name.length < 2 || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };

  for (const t of rawTags ?? []) push(t);
  for (const h of extractHashtags(title ?? '')) push(h);
  for (const h of extractHashtags(description ?? '')) push(h);

  return out.slice(0, MAX_TAGS_PER_VIDEO);
}

/**
 * Remplace intégralement les tags d'une vidéo.
 *
 * - upsert des `Tag` manquants ;
 * - suppression des `VideoTag` qui ne sont plus référencés ;
 * - réécriture des `position` (ordre de saisie) ;
 * - maintien du compteur `usageCount` (delta +1 / -1, jamais négatif).
 *
 * Le tout dans une transaction : les compteurs restent cohérents.
 */
export async function syncVideoTags(
  videoId: string,
  rawTags: string[] | undefined | null,
  description?: string | null,
  title?: string | null,
): Promise<TagDTO[]> {
  const names = mergeTagSources(rawTags, description, title);

  const existing = await prisma.videoTag.findMany({
    where: { videoId },
    include: { tag: { select: { id: true, name: true } } },
  });
  const existingByName = new Map(existing.map((vt) => [vt.tag.name, vt.tag.id]));

  // Rien à faire : mêmes tags, même ordre.
  const unchanged =
    existing.length === names.length &&
    names.every((n, i) => existing[i]?.tag.name === n && existing[i]?.position === i);
  if (unchanged) {
    const tags = await prisma.tag.findMany({ where: { name: { in: names } } });
    return orderTags(tags, names);
  }

  // 1. Création des tags absents du référentiel (idempotent).
  const missing = names.filter((n) => !existingByName.has(n));
  if (missing.length) {
    await prisma.tag.createMany({
      data: missing.map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  const tags = names.length
    ? await prisma.tag.findMany({ where: { name: { in: names } } })
    : [];
  const idByName = new Map(tags.map((t) => [t.name, t.id]));

  const nextIds = names
    .map((n) => idByName.get(n))
    .filter((id): id is string => Boolean(id));
  const previousIds = existing.map((vt) => vt.tagId);

  const removedIds = previousIds.filter((id) => !nextIds.includes(id));
  const addedIds = nextIds.filter((id) => !previousIds.includes(id));

  await prisma.$transaction([
    // 2. On remet la table de liaison à plat (l'ordre/position change souvent).
    prisma.videoTag.deleteMany({ where: { videoId } }),
    prisma.videoTag.createMany({
      data: nextIds.map((tagId, position) => ({ videoId, tagId, position })),
      skipDuplicates: true,
    }),
    // 3. Compteurs d'usage global.
    ...(addedIds.length
      ? [
          prisma.tag.updateMany({
            where: { id: { in: addedIds } },
            data: { usageCount: { increment: 1 } },
          }),
        ]
      : []),
    ...(removedIds.length
      ? [
          prisma.tag.updateMany({
            where: { id: { in: removedIds }, usageCount: { gt: 0 } },
            data: { usageCount: { decrement: 1 } },
          }),
        ]
      : []),
  ]);

  return orderTags(tags, names);
}

function orderTags(
  tags: { id: string; name: string; usageCount: number; trendingScore: number }[],
  order: string[],
): TagDTO[] {
  const byName = new Map(tags.map((t) => [t.name, t]));
  return order
    .map((n) => byName.get(n))
    .filter((t): t is (typeof tags)[number] => Boolean(t))
    .map(toTagDTO);
}

/**
 * Suggestions de hashtags pour le Studio / la barre de recherche.
 * Sans préfixe : top tendances. Avec préfixe : autocomplétion, tendances d'abord.
 */
export async function suggestTrendingTags(prefix?: string, limit = 10): Promise<TagDTO[]> {
  const normalized = prefix ? normalizeTag(prefix) : '';
  const tags = await prisma.tag.findMany({
    where: normalized ? { name: { startsWith: normalized } } : undefined,
    orderBy: [{ trendingScore: 'desc' }, { recentUsage: 'desc' }, { usageCount: 'desc' }],
    take: Math.min(Math.max(limit, 1), 50),
  });
  return tags.map(toTagDTO);
}

/** Détache tous les tags d'une vidéo (suppression) en décrémentant les compteurs. */
export async function detachVideoTags(videoId: string): Promise<void> {
  const existing = await prisma.videoTag.findMany({ where: { videoId }, select: { tagId: true } });
  if (!existing.length) return;
  const ids = existing.map((e) => e.tagId);
  await prisma.$transaction([
    prisma.videoTag.deleteMany({ where: { videoId } }),
    prisma.tag.updateMany({
      where: { id: { in: ids }, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    }),
  ]);
}
