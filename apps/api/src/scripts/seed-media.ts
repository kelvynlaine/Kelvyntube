/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MÉDIAS DE DÉMONSTRATION
 *
 *  Télécharge quelques vidéos libres de droits et les dépose dans le bucket
 *  objet sous le préfixe `demo/`. Le seed de base de données fait pointer les
 *  `mp4FallbackUrl` vers ces fichiers : la démonstration est ainsi autonome
 *  (pas de dépendance à un domaine tiers) et le lecteur fonctionne même sans
 *  FFmpeg installé.
 *
 *  Idempotent : un fichier déjà présent dans le bucket n'est pas retéléchargé.
 *
 *  Usage :  npm run media:seed
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { objectExists, putObject, publicUrl } from '../lib/storage.js';

interface DemoAsset {
  key: string;
  url: string;
  label: string;
}

/**
 * Sources : media.w3.org héberge ces extraits pour les tests HTML5 depuis 2010.
 * Sintel et Big Buck Bunny sont des courts métrages Blender sous licence
 * Creative Commons Attribution.
 */
const ASSETS: DemoAsset[] = [
  {
    key: 'demo/sintel.mp4',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    label: 'Sintel (bande-annonce)',
  },
  {
    key: 'demo/bunny-trailer.mp4',
    url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    label: 'Big Buck Bunny (bande-annonce)',
  },
  {
    key: 'demo/movie300.mp4',
    url: 'https://media.w3.org/2010/05/video/movie_300.mp4',
    label: 'Extrait de démonstration',
  },
];

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function formatBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function main() {
  console.log('🎞️  Médias de démonstration\n');

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of ASSETS) {
    if (await objectExists(asset.key)) {
      console.log(`  ⏭  ${asset.label} — déjà présent`);
      skipped += 1;
      continue;
    }

    try {
      process.stdout.write(`  ⬇  ${asset.label} — téléchargement…`);
      const buffer = await download(asset.url);
      await putObject(asset.key, buffer, 'video/mp4');
      console.log(`\r  ✅ ${asset.label} — ${formatBytes(buffer.byteLength)} importé`);
      imported += 1;
    } catch (err) {
      console.log(
        `\r  ❌ ${asset.label} — échec : ${err instanceof Error ? err.message : String(err)}`,
      );
      failed += 1;
    }
  }

  console.log(
    `\n${imported} importé(s), ${skipped} déjà présent(s), ${failed} en échec.`,
  );
  console.log(`   Servis depuis : ${publicUrl('demo/')}`);

  if (failed > 0) {
    console.log(
      '\n⚠️  Certains fichiers n\'ont pas pu être récupérés (réseau ou source indisponible).',
    );
    console.log(
      '   Le site reste utilisable : seule la lecture vidéo affichera un écran d\'erreur.',
    );
  }
}

main().catch((err) => {
  console.error('❌ Échec de l\'import des médias :', err);
  process.exitCode = 1;
});
