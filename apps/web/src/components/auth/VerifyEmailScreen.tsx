'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { ROUTES, type AuthResponseDTO } from '@kelvyntube/shared';
import { Button, Input, Spinner, useToast } from '@kelvyntube/ui';
import { api, ApiClientError, setAccessToken } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';

/**
 * Écran `/verifier-email` : consomme le `?token=` du lien reçu par email,
 * puis propose un renvoi en cas d'échec ou d'absence de jeton.
 */
export function VerifyEmailScreen() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const attempted = useRef(false);

  const verify = useMutation({
    mutationFn: (value: string) =>
      api.post<AuthResponseDTO>(ROUTES.auth.verifyEmail, { token: value }),
    onSuccess: async (response) => {
      // Le lien ouvre directement une session : on adopte le token renvoyé.
      setAccessToken(response.tokens.accessToken);
      await refreshUser();
    },
  });

  const resend = useMutation({
    mutationFn: (value: string | null) =>
      api.post<void>(ROUTES.auth.resendVerification, value ? { email: value } : {}),
    onSuccess: () => {
      toast({
        variant: 'success',
        message: 'Si un compte correspond, un nouvel email vient d’être envoyé.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'error',
        message:
          error instanceof ApiClientError
            ? error.message
            : 'Envoi impossible pour le moment.',
      });
    },
  });

  // Vérification automatique, une seule fois (`mutate` est stable).
  const verifyToken = verify.mutate;
  useEffect(() => {
    if (token && !attempted.current) {
      attempted.current = true;
      verifyToken(token);
    }
  }, [token, verifyToken]);

  const submitResend = (event: React.FormEvent) => {
    event.preventDefault();
    const value = user ? null : email.trim();
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value ?? '')) {
      setEmailError('Adresse email invalide');
      return;
    }
    setEmailError(undefined);
    resend.mutate(value);
  };

  // ── États ────────────────────────────────────────────────────────────────

  if (token && (verify.isPending || verify.isIdle)) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Spinner size={28} />
        <p className="text-kt-base text-fg-muted">Vérification de ton adresse…</p>
      </div>
    );
  }

  if (token && verify.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 size={40} aria-hidden="true" className="text-success" />
        <h1 className="text-kt-lg font-medium text-fg">Adresse vérifiée</h1>
        <p className="text-kt-base text-fg-muted">
          Ton compte est confirmé. Bonne exploration sur Kelvyn Tube !
        </p>
        <Link href={PATHS.home} className="kt-btn-primary h-11 px-6">
          Aller à l’accueil
        </Link>
      </div>
    );
  }

  const failed = token && verify.isError;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        {failed ? (
          <XCircle size={40} aria-hidden="true" className="text-danger" />
        ) : (
          <MailCheck size={40} aria-hidden="true" className="text-fg-muted" />
        )}
        <h1 className="text-kt-lg font-medium text-fg">
          {failed ? 'Lien invalide ou expiré' : 'Vérifie ton adresse email'}
        </h1>
        <p className="text-kt-base text-fg-muted">
          {failed
            ? 'Ce lien de confirmation n’est plus valable. Demande un nouvel email ci-dessous.'
            : 'Ouvre le lien que nous t’avons envoyé pour confirmer ton compte.'}
        </p>
      </div>

      <form onSubmit={submitResend} noValidate className="flex flex-col gap-4">
        {!user ? (
          <Input
            label="Adresse email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="toi@exemple.fr"
            value={email}
            error={emailError}
            onChange={(event) => setEmail(event.target.value)}
          />
        ) : null}

        <Button
          type="submit"
          variant="brand"
          size="lg"
          fullWidth
          loading={resend.isPending}
        >
          Renvoyer l’email de vérification
        </Button>
      </form>

      <p className="text-center text-kt-base text-fg-muted">
        <Link
          href={PATHS.login}
          className="rounded font-medium text-accent-fg hover:underline kt-focus-ring"
        >
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
