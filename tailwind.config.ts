import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        text:      'var(--color-text)',
        muted:     'var(--color-muted)',
        subtle:    'var(--color-subtle)',
        bg:        'var(--color-bg)',
        surface:   'var(--color-surface)',
        border:    'var(--color-border)',
        accent:    'var(--color-accent)',
        highlight: 'var(--color-highlight)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body:    ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
