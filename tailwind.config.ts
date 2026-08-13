import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-manrope)', 'sans-serif'],
        sans: ['var(--font-inter)', 'sans-serif'],
      },
      colors: {
        // "Harbor" — deep teal-navy, evokes a guided passage rather than
        // generic government blue. Primary brand scale.
        harbor: {
          50: '#eef6f7',
          100: '#d7e9ec',
          200: '#b0d3d9',
          300: '#80b6c0',
          400: '#4f95a3',
          500: '#347989',
          600: '#276272',
          700: '#20505d',
          800: '#173a44',
          900: '#0e242b',
          950: '#081720',
        },
        // "Compass" — warm amber accent used sparingly for primary actions
        // and progress highlights.
        compass: {
          50: '#fff8ec',
          100: '#ffedc7',
          200: '#ffd88a',
          300: '#ffbe4d',
          400: '#feaa2b',
          500: '#f68b0f',
          600: '#da6a09',
          700: '#b54c0b',
          800: '#933c10',
          900: '#793310',
        },
        success: {
          50: '#ecfdf5',
          500: '#10b981',
          600: '#059669',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
        },
        ink: {
          50: '#f6f7f8',
          100: '#eceef0',
          200: '#d3d8dc',
          300: '#aab3ba',
          400: '#798590',
          500: '#5d6874',
          600: '#4a545e',
          700: '#3d454d',
          800: '#282e34',
          900: '#181c20',
          950: '#0d0f12',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,15,18,0.04), 0 8px 24px -8px rgba(13,15,18,0.10)',
        'card-hover': '0 2px 4px rgba(13,15,18,0.06), 0 16px 32px -12px rgba(13,15,18,0.16)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
}

export default config
