'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { ROUTES, requestPasswordResetSchema } from '@kelvyntube/shared';
import { Button, Input } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { apiFormErrors, NO_ERRORS, validateWith, type FormErrors } from './form-utils';

/**
 * Écran `/mot-de-passe/oubli`.
 * L'API répond 204 quel que soit l'email : le message de confirmation est
 * volontairement neutre et ne révèle jamais l'existence d'un compte.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: (value: string) =>
      api.post<void>(ROUTES.auth.requestPasswordReset, { email: value }),
    onSuccess: () => setSent(true),
    onError: (error) => setErrors(apiFormErrors(error, ['email'])),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateWith(requestPasswordResetSchema, { email: email.trim() });
    if (!result.ok) {
      setErrors({ fields: { email: 'Adresse email invalide' } });
      return;
    }
    setErrors(NO_ERRORS);
    mutation.mutate(result.data.email);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheck size={40} aria-hidden="true" className="text-fg-muted" />
        <h1 className="text-kt-lg font-medium text-fg">Vérifie ta boîte mail</h1>
        <p className="text-kt-base text-fg-muted">
          Si un compte est associé à cette adresse, un lien de réinitialisation
          vient d’être envoyé. Le lien expire au bout d’une heure.
        </p>
        <Link href={PATHS.login} className="kt-btn-secondary h-11 px-6">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-kt-lg font-medium text-fg">Mot de passe oublié</h1>
        <p className="text-kt-base text-fg-muted">
          Indique ton adresse email : nous t’enverrons un lien de
          réinitialisation.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          label="Adresse email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="toi@exemple.fr"
          value={email}
          error={errors.fields.email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {errors.global ? (
          <p role="alert" className="text-kt-sm text-danger">
            {errors.global}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="brand"
          size="lg"
          fullWidth
          loading={mutation.isPending}
        >
          Envoyer le lien
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
