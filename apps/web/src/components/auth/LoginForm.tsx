'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { loginSchema } from '@kelvyntube/shared';
import { Button, Input } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';
import { AuthDivider, GoogleButton, isGoogleEnabled } from './GoogleButton';
import { PasswordInput } from './PasswordInput';
import { apiFormErrors, NO_ERRORS, validateWith, type FormErrors } from './form-utils';

export interface LoginFormProps {
  /** Appelé après une connexion réussie (redirection ou fermeture de modale). */
  onSuccess?: () => void;
  /** Bascule vers l'inscription (utilisé dans la modale). */
  onSwitchToRegister?: () => void;
  /** Masque les liens de navigation (modale : liens fournis par le parent). */
  hideFooterLinks?: boolean;
  /** Identifiant de section pour les libellés (évite les collisions d'ids). */
  submitLabel?: string;
}

/** Formulaire de connexion — partagé par `/connexion` et par `AuthModal`. */
export function LoginForm({
  onSuccess,
  onSwitchToRegister,
  hideFooterLinks = false,
  submitLabel = 'Se connecter',
}: LoginFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateWith(loginSchema, { email: email.trim(), password });
    if (!result.ok) {
      // `loginSchema` n'a pas de messages personnalisés : on les rend lisibles.
      setErrors({
        fields: {
          ...result.errors.fields,
          ...(result.errors.fields.email ? { email: 'Adresse email invalide' } : {}),
          ...(result.errors.fields.password ? { password: 'Mot de passe requis' } : {}),
        },
      });
      return;
    }

    setErrors(NO_ERRORS);
    setPending(true);
    try {
      await login(result.data.email, result.data.password);
      onSuccess?.();
    } catch (error) {
      setErrors(apiFormErrors(error, ['email', 'password']));
    } finally {
      setPending(false);
    }
  };

  return (
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

      <div className="flex flex-col gap-1.5">
        <PasswordInput
          label="Mot de passe"
          autoComplete="current-password"
          required
          value={password}
          error={errors.fields.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Link
          href={PATHS.forgotPassword}
          className="self-start rounded text-kt-sm text-accent-fg hover:underline kt-focus-ring"
        >
          Mot de passe oublié ?
        </Link>
      </div>

      {errors.global ? (
        <p role="alert" className="text-kt-sm text-danger">
          {errors.global}
        </p>
      ) : null}

      <Button type="submit" variant="brand" size="lg" fullWidth loading={pending}>
        {submitLabel}
      </Button>

      {isGoogleEnabled() ? (
        <>
          <AuthDivider />
          <GoogleButton label="Se connecter avec Google" />
        </>
      ) : null}

      {!hideFooterLinks ? (
        <p className="text-center text-kt-base text-fg-muted">
          Pas encore de compte ?{' '}
          {onSwitchToRegister ? (
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="rounded font-medium text-accent-fg hover:underline kt-focus-ring"
            >
              Créer un compte
            </button>
          ) : (
            <Link
              href={PATHS.register}
              className="rounded font-medium text-accent-fg hover:underline kt-focus-ring"
            >
              Créer un compte
            </Link>
          )}
        </p>
      ) : null}
    </form>
  );
}
