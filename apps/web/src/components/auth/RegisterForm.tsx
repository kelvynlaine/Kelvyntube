'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { registerSchema } from '@kelvyntube/shared';
import { Button, Input } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';
import { AuthDivider, GoogleButton, isGoogleEnabled } from './GoogleButton';
import { PasswordInput } from './PasswordInput';
import { PasswordStrength } from './PasswordStrength';
import { apiFormErrors, NO_ERRORS, validateWith, type FormErrors } from './form-utils';

export interface RegisterFormProps {
  /** Appelé après une inscription réussie. */
  onSuccess?: () => void;
  /** Bascule vers la connexion (utilisé dans la modale). */
  onSwitchToLogin?: () => void;
  hideFooterLinks?: boolean;
}

/** Formulaire d'inscription — partagé par `/inscription` et par `AuthModal`. */
export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
  hideFooterLinks = false,
}: RegisterFormProps) {
  const { register } = useAuth();
  const strengthId = `kt-strength-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateWith(registerSchema, {
      email: email.trim(),
      password,
      displayName: displayName.trim(),
    });
    if (!result.ok) {
      setErrors({
        fields: {
          ...result.errors.fields,
          ...(result.errors.fields.displayName
            ? { displayName: 'Entre un nom de 2 à 50 caractères' }
            : {}),
        },
      });
      return;
    }

    setErrors(NO_ERRORS);
    setPending(true);
    try {
      await register(result.data.email, result.data.password, result.data.displayName);
      onSuccess?.();
    } catch (error) {
      setErrors(apiFormErrors(error, ['email', 'password', 'displayName']));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Nom d’affichage"
        autoComplete="name"
        required
        placeholder="Kelvyn"
        value={displayName}
        error={errors.fields.displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />

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

      <div className="flex flex-col gap-2">
        <PasswordInput
          label="Mot de passe"
          autoComplete="new-password"
          required
          value={password}
          error={errors.fields.password}
          aria-describedby={strengthId}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrength id={strengthId} value={password} />
      </div>

      {errors.global ? (
        <p role="alert" className="text-kt-sm text-danger">
          {errors.global}
        </p>
      ) : null}

      <Button type="submit" variant="brand" size="lg" fullWidth loading={pending}>
        Créer mon compte
      </Button>

      {isGoogleEnabled() ? (
        <>
          <AuthDivider />
          <GoogleButton label="S’inscrire avec Google" />
        </>
      ) : null}

      {!hideFooterLinks ? (
        <p className="text-center text-kt-base text-fg-muted">
          Déjà un compte ?{' '}
          {onSwitchToLogin ? (
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="rounded font-medium text-accent-fg hover:underline kt-focus-ring"
            >
              Se connecter
            </button>
          ) : (
            <Link
              href={PATHS.login}
              className="rounded font-medium text-accent-fg hover:underline kt-focus-ring"
            >
              Se connecter
            </Link>
          )}
        </p>
      ) : null}
    </form>
  );
}
