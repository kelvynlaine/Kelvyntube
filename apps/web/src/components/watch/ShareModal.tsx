'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Link2, Mail, MessageCircle, Send } from 'lucide-react';
import { Button, Checkbox, Modal, useToast } from '@kelvyntube/ui';
import { formatDuration, type VideoDetailDTO } from '@kelvyntube/shared';
import { PATHS } from '@/lib/nav';

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  video: VideoDetailDTO;
  /** Position de lecture au moment de l'ouverture (secondes). */
  currentTime: number;
  playlistId?: string | null;
}

interface ShareTarget {
  id: string;
  label: string;
  /** Construit l'URL de partage du réseau. */
  href: (url: string, title: string) => string;
  icon: ReactNode;
}

const TARGETS: ShareTarget[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: <MessageCircle size={20} aria-hidden="true" />,
    href: (url, title) =>
      `https://api.whatsapp.com/send?text=${encodeURIComponent(`${title} ${url}`)}`,
  },
  {
    id: 'x',
    label: 'X',
    icon: <Send size={20} aria-hidden="true" />,
    href: (url, title) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: <Link2 size={20} aria-hidden="true" />,
    href: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'email',
    label: 'E-mail',
    icon: <Mail size={20} aria-hidden="true" />,
    href: (url, title) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  },
];

/** Modale de partage : lien, horodatage, réseaux et code d'intégration. */
export function ShareModal({
  open,
  onClose,
  video,
  currentTime,
  playlistId,
}: ShareModalProps) {
  const { toast } = useToast();
  const [origin, setOrigin] = useState('');
  const [withTimestamp, setWithTimestamp] = useState(false);
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);

  const startAt = Math.max(0, Math.floor(currentTime));

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  // L'horodatage est réinitialisé à chaque ouverture.
  useEffect(() => {
    if (open) {
      setWithTimestamp(false);
      setCopied(null);
    }
  }, [open]);

  const shareUrl = useMemo(() => {
    const path = PATHS.watch(video.id, {
      list: playlistId ?? undefined,
      t: withTimestamp ? startAt : undefined,
    });
    return `${origin}${path}`;
  }, [origin, playlistId, startAt, video.id, withTimestamp]);

  const embedCode = useMemo(
    () =>
      `<iframe width="560" height="315" src="${origin}${PATHS.watch(video.id)}" ` +
      `title="${video.title.replace(/"/g, '&quot;')}" frameborder="0" ` +
      `allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" ` +
      `allowfullscreen></iframe>`,
    [origin, video.id, video.title],
  );

  const copy = async (value: string, kind: 'link' | 'embed') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast({ message: 'Copié dans le presse-papiers.', variant: 'success' });
    } catch {
      toast({ message: 'Copie impossible sur ce navigateur.', variant: 'error' });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Partager" size="md">
      <div className="flex flex-col gap-5">
        {/* Réseaux */}
        <ul className="flex flex-wrap gap-3" aria-label="Partager sur un réseau">
          {TARGETS.map((target) => (
            <li key={target.id}>
              <a
                href={target.href(shareUrl, video.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-20 flex-col items-center gap-2 rounded-kt p-2 text-kt-sm text-fg-muted transition-colors hover:bg-bg-hover kt-focus-ring"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-bg-active text-fg">
                  {target.icon}
                </span>
                {target.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Lien */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-kt border border-border bg-bg p-2">
            <span className="kt-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-kt-base text-fg-muted">
              {shareUrl}
            </span>
            <Button
              variant="primary"
              iconLeft={
                copied === 'link' ? <Check size={16} /> : <Copy size={16} />
              }
              onClick={() => void copy(shareUrl, 'link')}
            >
              Copier
            </Button>
          </div>

          <Checkbox
            checked={withTimestamp}
            onChange={(event) => setWithTimestamp(event.target.checked)}
            label={`Commencer à ${formatDuration(startAt)}`}
          />
        </div>

        {/* Intégration */}
        <div className="flex flex-col gap-2">
          <h3 className="text-kt-base font-medium text-fg">Code d'intégration</h3>
          <textarea
            readOnly
            rows={3}
            value={embedCode}
            aria-label="Code d'intégration"
            className="kt-scroll w-full resize-none rounded-kt border border-border bg-bg p-3 font-mono text-kt-sm text-fg-muted kt-focus-ring"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="secondary"
            className="self-start"
            iconLeft={copied === 'embed' ? <Check size={16} /> : <Copy size={16} />}
            onClick={() => void copy(embedCode, 'embed')}
          >
            Copier le code
          </Button>
        </div>
      </div>
    </Modal>
  );
}
