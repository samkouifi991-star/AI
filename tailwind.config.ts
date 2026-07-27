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
        danger: '#dc2626'
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        card: '14px'
      }
    }
  },
  plugins: []
};

export default config;
