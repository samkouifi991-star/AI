import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          600: '#475569',
          900: '#0f172a'
        },
        brand: {
          50: '#eef4ff',
          100: '#dbe7fe',
          500: '#3457d5',
          600: '#2a46b0',
          700: '#22398f'
        },
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',

        // Dashboard redesign tokens (design_handoff_dashboard_redesign),
        // namespaced "bp-" so they never collide with the tokens above —
        // those still power the marketing site, auth pages, and any
        // dashboard route not yet ported to the new design.
        'bp-bg': 'oklch(0.98 0.004 85)',
        'bp-surface': '#ffffff',
        'bp-surface-alt': 'oklch(0.985 0.004 85)',
        'bp-ink': 'oklch(0.28 0.012 265)',
        'bp-ink-strong': 'oklch(0.21 0.012 265)',
        'bp-ink-body': 'oklch(0.24 0.012 265)',
        'bp-ink-mid': 'oklch(0.3 0.012 265)',
        'bp-ink-mid-2': 'oklch(0.35 0.012 265)',
        'bp-ink-muted': 'oklch(0.56 0.01 265)',
        'bp-ink-faint': 'oklch(0.62 0.01 265)',
        'bp-accent': 'oklch(0.56 0.15 265)',
        'bp-accent-hover': 'oklch(0.48 0.15 265)',
        'bp-accent-soft': 'oklch(0.66 0.15 265)',
        'bp-good': 'oklch(0.62 0.13 165)',
        'bp-good-ink': 'oklch(0.44 0.11 165)',
        'bp-good-bg': 'oklch(0.955 0.035 165)',
        'bp-warn': 'oklch(0.68 0.13 65)',
        'bp-warn-ink': 'oklch(0.46 0.11 65)',
        'bp-warn-bg': 'oklch(0.965 0.04 65)',
        'bp-info-ink': 'oklch(0.47 0.13 265)',
        'bp-info-bg': 'oklch(0.96 0.02 265)',
        'bp-mute-ink': 'oklch(0.52 0.01 265)',
        'bp-mute-bg': 'oklch(0.955 0.004 265)',
        'bp-border': 'oklch(0.925 0.005 265)',
        'bp-border-soft': 'oklch(0.955 0.004 265)',
        'bp-border-faint': 'oklch(0.965 0.004 265)',
        'bp-border-input': 'oklch(0.90 0.006 265)',

        'bp-dark-900': 'oklch(0.19 0.014 265)',
        'bp-dark-800': 'oklch(0.235 0.016 265)',
        'bp-dark-700': 'oklch(0.28 0.016 265)',
        'bp-dark-600': 'oklch(0.30 0.018 265)',
        'bp-dark-500': 'oklch(0.32 0.016 265)',
        'bp-dark-nav-active': 'oklch(0.28 0.02 265)',
        'bp-on-dark': '#ffffff',
        'bp-on-dark-2': 'oklch(0.97 0.004 265)',
        'bp-on-dark-mid': 'oklch(0.92 0.004 265)',
        'bp-on-dark-mid-2': 'oklch(0.88 0.004 265)',
        'bp-on-dark-muted': 'oklch(0.72 0.01 265)',
        'bp-on-dark-muted-2': 'oklch(0.68 0.01 265)',
        'bp-on-dark-faint': 'oklch(0.6 0.01 265)'
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        grotesk: ['var(--font-grotesk)', 'sans-serif'],
        instrument: ['var(--font-instrument)', 'system-ui', 'sans-serif'],
        jetbrains: ['var(--font-jetbrains)', 'monospace']
      },
      borderRadius: {
        card: '14px'
      }
    }
  },
  plugins: []
};

export default config;
