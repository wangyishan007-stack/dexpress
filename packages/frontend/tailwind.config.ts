import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#000000',
        surface: '#111111',
        border:  '#222222',
        muted:   '#2e2e2e',
        text:    '#ffffff',
        sub:     '#999999',
        header:  '#bbbbbb',
        green:   '#2fe06b',
        red:     '#ff4466',
        yellow:  '#ffd166',
        blue:    '#2744FF',
      },
      fontFamily: {
        mono: ['Arial', 'Helvetica', 'sans-serif'],
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
      keyframes: {
        flashGreen: {
          '0%,100%': { backgroundColor: 'transparent' },
          '30%':     { backgroundColor: 'rgba(0,255,136,0.15)' },
        },
        flashRed: {
          '0%,100%': { backgroundColor: 'transparent' },
          '30%':     { backgroundColor: 'rgba(255,68,102,0.15)' },
        },
      },
      animation: {
        'flash-green': 'flashGreen 0.6s ease',
        'flash-red':   'flashRed   0.6s ease',
      },
    },
  },
  plugins: [],
} satisfies Config
