'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  DEFAULT_CATEGORIES,
  ROUTES,
  handleSchema,
  onboardingSchema,
  type AuthResponseDTO,
} from '@kelvyntube/shared';
import { Avatar, Button, Input, ProgressBar, Spinner } from '@kelvyntube/ui';
import { api, setAccessToken } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';
import { apiFormErrors, NO_ERRORS, safeNextPath, type FormErrors } from './form-utils';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONBOARDING — assistant en 3 étapes
 *   1. handle (disponibilité en direct, débounce 400 ms)
 *   2. nom de chaîne + aperçu de l'avatar par défaut
 *   3. centres d'intérêt (multi-sélection, minimum 1)
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface HandleCheckDTO {
  available: boolean;
  suggestions: string[];
}

const STEP_TITLES = [
  'Choisis ton identifiant',
  'Nomme ta chaîne',
  'Tes centres d’intérêt',
] as const;

const DEBOUNCE_MS = 400;

/** Normalise la saisie : sans « @ », en minuscules, sans espaces. */
function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();
}

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, refreshUser } = useAuth();
  const next = safeNextPath(searchParams.get('next'), PATHS.home);

  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState('');
  const [debouncedHandle, setDebouncedHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  // ── Redirections d'entrée ────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`${PATHS.login}?next=${encodeURIComponent(PATHS.onboarding)}`);
      return;
    }
    if (user.onboarded) router.replace(next);
  }, [loading, user, next, router]);

  // Pré-remplit le nom de chaîne avec le nom d'affichage du compte.
  useEffect(() => {
    if (user && displayName === '') setDisplayName(user.displayName);
  }, [user, displayName]);

  // ── Étape 1 : disponibilité du handle ────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedHandle(handle), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [handle]);

  const handleFormat = handleSchema.safeParse(debouncedHandle);
  const handleQuery = useQuery({
    queryKey: ['handle-check', debouncedHandle],
    queryFn: () =>
      api.get<HandleCheckDTO>(ROUTES.channels.checkHandle, {
        query: { handle: debouncedHandle },
      }),
    enabled: handleFormat.success,
    retry: false,
  });

  const typing = handle !== debouncedHandle;
  const formatError =
    handle.length > 0 && !typing && !handleFormat.success
      ? handleFormat.error.issues[0]?.message
      : undefined;
  const available = handleQuery.data?.available === true;
  const taken = handleQuery.data?.available === false;

  // ── Étape 3 : centres d'intérêt ──────────────────────────────────────────
  const toggleInterest = (slug: string) => {
    setInterests((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : current.length >= 12
          ? current
          : [...current, slug],
    );
  };

  // ── Soumission ───────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (body: { handle: string; displayName: string; interests: string[] }) =>
      api.post<AuthResponseDTO>(ROUTES.auth.onboarding, body),
    onSuccess: async (response) => {
      // Le nouveau token porte la chaîne active (`cid`).
      setAccessToken(response.tokens.accessToken);
      await refreshUser();
      router.replace(next);
    },
    onError: (error) => {
      const mapped = apiFormErrors(error, ['handle', 'displayName', 'interests']);
      setErrors(mapped);
      // Retour à l'étape fautive.
      if (mapped.fields.handle) setStep(0);
      else if (mapped.fields.displayName) setStep(1);
    },
  });

  const submit = () => {
    const parsed = onboardingSchema.safeParse({
      handle: normalizeHandle(handle),
      displayName: displayName.trim(),
      interests,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        fields: {
          ...(flat.handle?.[0] ? { handle: flat.handle[0] } : {}),
          ...(flat.displayName?.[0]
            ? { displayName: 'Entre un nom de 2 à 50 caractères' }
            : {}),
          ...(flat.interests?.[0] ? { interests: flat.interests[0] } : {}),
        },
      });
      if (flat.handle) setStep(0);
      else if (flat.displayName) setStep(1);
      return;
    }
    setErrors(NO_ERRORS);
    mutation.mutate(parsed.data);
  };

  const canContinue = useMemo(() => {
    if (step === 0) return handleFormat.success && available;
    if (step === 1) return displayName.trim().length >= 2;
    return interests.length >= 1;
  }, [step, handleFormat.success, available, displayName, interests.length]);

  if (loading || !user || user.onboarded) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size={24} />
        <span className="sr-only">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-kt-sm font-medium text-fg-subtle">
          Étape {step + 1} sur 3
        </p>
        <h1 className="text-kt-lg font-medium text-fg">{STEP_TITLES[step]}</h1>
        <ProgressBar
          value={step + 1}
          max={3}
          size="sm"
          variant="brand"
          ariaLabel={`Progression de la configuration : étape ${step + 1} sur 3`}
        />
      </header>

      {/* ── Étape 1 : handle ─────────────────────────────────────────────── */}
      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <Input
            label="Identifiant de la chaîne"
            hint="3 à 30 caractères : lettres, chiffres, point, tiret, underscore."
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="kelvyn"
            value={handle}
            iconLeft={<span aria-hidden="true">@</span>}
            error={errors.fields.handle ?? formatError}
            onChange={(event) => setHandle(normalizeHandle(event.target.value))}
            iconRight={
              typing || handleQuery.isFetching ? (
                <Loader2 size={16} aria-hidden="true" className="animate-spin" />
              ) : available ? (
                <span
                  aria-hidden="true"
                  className="flex size-4 items-center justify-center rounded-full bg-success text-bg"
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : taken ? (
                <span
                  aria-hidden="true"
                  className="flex size-4 items-center justify-center rounded-full bg-danger text-bg"
                >
                  <AlertCircle size={12} strokeWidth={3} />
                </span>
              ) : undefined
            }
          />

          <p role="status" aria-live="polite" className="text-kt-sm">
            {available ? (
              <span className="text-success">@{debouncedHandle} est disponible.</span>
            ) : taken ? (
              <span className="text-danger">@{debouncedHandle} est déjà pris.</span>
            ) : (
              <span className="text-fg-subtle">
                L’identifiant apparaît dans l’URL de ta chaîne.
              </span>
            )}
          </p>

          {taken && (handleQuery.data?.suggestions.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-kt-sm text-fg-muted">Suggestions :</p>
              <ul className="flex flex-wrap gap-2">
                {handleQuery.data?.suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => setHandle(normalizeHandle(suggestion))}
                      className="kt-chip"
                    >
                      @{suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Étape 2 : nom + avatar ───────────────────────────────────────── */}
      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              name={displayName || handle || '?'}
              size="lg"
              alt={`Aperçu de l’avatar de ${displayName || handle}`}
            />
            <p className="text-kt-sm text-fg-subtle">
              Avatar généré à partir de tes initiales — modifiable plus tard.
            </p>
          </div>

          <Input
            label="Nom de la chaîne"
            hint="C’est le nom affiché sous tes vidéos."
            autoComplete="nickname"
            required
            placeholder="Kelvyn Tube"
            value={displayName}
            error={errors.fields.displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <p className="text-kt-sm text-fg-muted">
            Ta chaîne sera accessible sur{' '}
            <span className="font-medium text-fg">kelvyntube.fr/@{handle}</span>
          </p>
        </div>
      ) : null}

      {/* ── Étape 3 : centres d'intérêt ──────────────────────────────────── */}
      {step === 2 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-kt-base text-fg-muted">
            Ces choix amorcent tes recommandations.
          </legend>

          <div className="grid grid-cols-2 gap-2 xs:grid-cols-3">
            {DEFAULT_CATEGORIES.map((category) => {
              const selected = interests.includes(category.slug);
              return (
                <label
                  key={category.slug}
                  className={[
                    'flex cursor-pointer items-center justify-center rounded-kt border p-3 text-center',
                    'text-kt-base font-medium transition-colors',
                    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-fg',
                    selected
                      ? 'border-fg bg-fg text-fg-inverse'
                      : 'border-border bg-bg text-fg hover:bg-bg-hover',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() => toggleInterest(category.slug)}
                  />
                  {category.name}
                </label>
              );
            })}
          </div>

          <p role="status" aria-live="polite" className="text-kt-sm text-fg-subtle">
            {interests.length === 0
              ? 'Choisis au moins un centre d’intérêt.'
              : `${interests.length} sélectionné${interests.length > 1 ? 's' : ''}.`}
          </p>

          {errors.fields.interests ? (
            <p role="alert" className="text-kt-sm text-danger">
              {errors.fields.interests}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {errors.global ? (
        <p role="alert" className="text-kt-sm text-danger">
          {errors.global}
        </p>
      ) : null}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="lg"
          iconLeft={<ArrowLeft size={18} />}
          disabled={step === 0 || mutation.isPending}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          Retour
        </Button>

        {step < 2 ? (
          <Button
            variant="brand"
            size="lg"
            iconRight={<ArrowRight size={18} />}
            disabled={!canContinue}
            onClick={() => setStep((current) => Math.min(2, current + 1))}
          >
            Continuer
          </Button>
        ) : (
          <Button
            variant="brand"
            size="lg"
            loading={mutation.isPending}
            disabled={!canContinue}
            onClick={submit}
          >
            Terminer
          </Button>
        )}
      </div>
    </div>
  );
}
