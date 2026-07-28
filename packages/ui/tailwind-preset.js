/**
 * Preset Tailwind — design system Kelvyn Tube.
 * Palette et espacements calqués sur l'esthétique YouTube moderne
 * (thème sombre par défaut, bascule clair via la classe `.light`).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Les valeurs sont pilotées par des variables CSS (cf. styles.css)
        bg: {
          DEFAULT: 'rgb(var(--kt-bg) / <alpha-value>)',
          elevated: 'rgb(var(--kt-bg-elevated) / <alpha-value>)',
          hover: 'rgb(var(--kt-bg-hover) / <alpha-value>)',
          active: 'rgb(var(--kt-bg-active) / <alpha-value>)',
          inverse: 'rgb(var(--kt-bg-inverse) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--kt-fg) / <alpha-value>)',
          muted: 'rgb(var(--kt-fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--kt-fg-subtle) / <alpha-value>)',
          inverse: 'rgb(var(--kt-fg-inverse) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--kt-border) / <alpha-value>)',
          strong: 'rgb(var(--kt-border-strong) / <alpha-value>)',
        },
        brand: {
          DEFAULT: '#ff0033',
          hover: '#e6002e',
          soft: 'rgb(var(--kt-brand-soft) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--kt-accent) / <alpha-value>)',
          fg: 'rgb(var(--kt-accent-fg) / <alpha-value>)',
        },
        success: '#2ba640',
        warning: '#ffa000',
        danger: '#f03e3e',
      },
      fontFamily: {
        sans: [
          'Roboto',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // Échelle typographique YouTube
        'kt-xs': ['11px', { lineHeight: '16px' }],
        'kt-sm': ['12px', { lineHeight: '18px' }],
        'kt-base': ['14px', { lineHeight: '20px' }],
        'kt-md': ['16px', { lineHeight: '22px' }],
        'kt-lg': ['20px', { lineHeight: '28px' }],
        'kt-xl': ['24px', { lineHeight: '32px' }],
      },
      borderRadius: {
        kt: '12px',
        'kt-lg': '16px',
        'kt-xl': '24px',
        pill: '9999px',
      },
      spacing: {
        sidebar: '240px',
        'sidebar-mini': '72px',
        topbar: '56px',
        bottomnav: '48px',
      },
      maxWidth: {
        watch: '1754px',
        feed: '2160px',
      },
      transitionTimingFunction: {
        kt: 'cubic-bezier(0.05, 0, 0, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pop-heart': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.25)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.05, 0, 0, 1)',
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.05, 0, 0, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'pop-heart': 'pop-heart 300ms ease-out',
      },
      screens: {
        /*
         * `xxs` (360 px) : plus petit palier « téléphone étroit ». Ajouté pour
         * pouvoir dégrader proprement en dessous (libellés courts de la barre
         * de navigation, largeur de miniature en liste) sans toucher aux
         * paliers historiques de la grille, qui restent la référence.
         */
        xxs: '360px',
        // Points de rupture de la grille de vidéos (1 → 5 colonnes)
        xs: '480px',
        'feed-2': '650px',
        'feed-3': '900px',
        'feed-4': '1150px',
        'feed-5': '1450px',
        'feed-6': '1800px',
        /*
         * NOTE — pas de palier `{ raw: '(pointer: coarse)' }` ici.
         * Dès qu'un seul écran est déclaré sous forme d'objet, Tailwind
         * désactive les variantes `min-[…]` / `max-[…]` pour TOUTE la config
         * (« The `min-*` and `max-*` variants are not supported with a
         * `screens` configuration containing objects »), or la page de
         * visionnage repose sur `min-[1015px]:`. Les cibles tactiles passent
         * donc par des classes CSS (`kt-tap`, `kt-tap-y`, `kt-tap-halo`,
         * `kt-coarse-hidden`) déclarées dans `styles.css` sous
         * `@media (pointer: coarse)`.
         */
      },
    },
  },
  plugins: [],
};
