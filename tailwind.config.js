/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        raised: 'var(--color-raised)',
        inset: 'var(--color-inset)',
        border: 'var(--color-border)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          weak: 'var(--color-accent-weak)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          weak: 'var(--color-success-weak)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          weak: 'var(--color-warning-weak)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          weak: 'var(--color-error-weak)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
