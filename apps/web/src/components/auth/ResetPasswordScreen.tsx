'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ROUTES, resetPasswordSchema } from '@kelvyntube/shared';
import { Button } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { PasswordInput } from './PasswordInput';
import { PasswordStrength } from './PasswordStrength';
import { apiFormErrors, NO_ERRORS, validateWith, type FormErrors } from './form-utils';

/**
 * Écran `/mot-de-passe/reinitialiser` : consomme le `?token=` du mail.
 * Toutes les sessions sont révoquées côté API : on renvoie vers la connexion.
 */
export function ResetPasswordScreen() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const strengthId = `kt-reset-strength-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api.post<void>(ROUTES.auth.resetPassword, body),
    onSuccess: () => setDone(true),
    onError: (error) => setErrors(apiFormErrors(error, ['token', 'password'])),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setErrors({ fields: { confirm: 'Les deux mots de passe ne correspondent pas' } });
      return;
    }
    const result = validateWith(resetPasswordSchema, { token, password });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(NO_ERRORS);
    mutation.mutate(result.data);
  };

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <XCircle size={40} aria-hidden="true" className="text-danger" />
        <h1 className="text-kt-lg font-medium text-fg">Lien incomplet</h1>
        <p className="text-kt-base text-fg-muted">
          Ce lien de réinitialisation est invalide. Demande-en un nouveau.
        </p>
        <Link href={PATHS.forgotPassword} className="kt-btn-primary h-11 px-6">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 size={40} aria-hidden="true" className="text-success" />
        <h1 className="text-kt-lg font-medium text-fg">Mot de passe mis à jour</h1>
        <p className="text-kt-base text-fg-muted">
          Toutes tes sessions ont été déconnectées. Reconnecte-toi avec ton
          nouveau mot de passe.
        </p>
        <Link href={PATHS.login} className="kt-btn-primary h-11 px-6">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-kt-lg font-medium text-fg">Nouveau mot de passe</h1>
        <p className="text-kt-base text-fg-muted">
          Choisis un mot de passe solide : il remplacera l’ancien sur tous tes
          appareils.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <PasswordInput
            label="Nouveau mot de passe"
            autoComplete="new-password"
            required
            value={password}
            error={errors.fields.password}
            aria-describedby={strengthId}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrength id={strengthId} value={password} />
        </div>

        <PasswordInput
          label="Confirmation"
          autoComplete="new-password"
          required
          value={confirm}
          error={errors.fields.confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />

        {errors.fields.token ? (
          <p role="alert" className="text-kt-sm text-danger">
            {errors.fields.token}
          </p>
        ) : null}
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
          Enregistrer le nouveau mot de passe
        </Button>
      </form>
    </div>
  );
}
