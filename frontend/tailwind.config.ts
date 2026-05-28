import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0a',
          1: '#111111',
          2: '#161616',
          3: '#1c1c1c',
          4: '#222222',
        },
        border: {
          0: '#1a1a1a',
          1: '#222222',
          2: '#2e2e2e',
          3: '#3a3a3a',
        },
        text: {
          primary:   '#ededed',
          secondary: '#a1a1a1',
          tertiary:  '#6e6e6e',
        },
        accent: {
          DEFAULT: '#adff2f',
          dim:     '#1a2400',
          border:  '#3a5500',
          text:    '#8ed022',
        },
        layer: {
          meta:     '#adff2f',
          build:    '#f97316',
          validate: '#38bdf8',
          ops:      '#a78bfa',
        },
        error:   '#ff4444',
        warning: '#f5a623',
        info:    '#3b9edd',
        success: '#22c55e',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs':   ['11px', { lineHeight: '16px', letterSpacing: '0.04em' }],
        'sm':   ['12px', { lineHeight: '18px' }],
        'base': ['13px', { lineHeight: '20px' }],
        'md':   ['14px', { lineHeight: '20px' }],
        'lg':   ['16px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
        'xl':   ['20px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        '2xl':  ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        '3xl':  ['32px', { lineHeight: '40px', letterSpacing: '-0.03em' }],
      },
      spacing: {
        '1': '4px',  '2': '8px',   '3': '12px', '4': '16px',
        '5': '20px', '6': '24px',  '8': '32px',  '10': '40px',
        '12': '48px', '16': '64px',
      },
      borderRadius: {
        'sm': '3px', 'md': '5px', 'lg': '8px', 'xl': '12px',
      },
      transitionDuration: {
        'fast':   '150ms',
        'normal': '200ms',
        'slow':   '300ms',
      },
      transitionTimingFunction: {
        'default': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      animation: {
        'pulse-subtle':    'pulse-subtle 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-right':  'slide-in-right 200ms cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
