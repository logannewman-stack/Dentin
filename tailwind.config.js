/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dentin brand — the clinical teal that sits beneath the rest.
        brand: {
          50: '#EDFAF9',
          100: '#D2F2F0',
          200: '#A6E5E2',
          300: '#71D2CE',
          400: '#3FB8B4',
          500: '#1E9B98',
          600: '#0E7C7B',
          700: '#0C6262',
          800: '#0D4E4F',
          900: '#0F4142',
        },
        // Enamel/dentin neutrals — warm ivory, not a flat grey.
        ivory: {
          50: '#FDFCFA',
          100: '#F7F5F0',
          200: '#EFEBE2',
          300: '#E2DCCE',
          400: '#CFC6B2',
        },
        // iOS system semantics
        ios: {
          blue: '#007AFF',
          green: '#34C759',
          indigo: '#5856D6',
          orange: '#FF9500',
          pink: '#FF2D55',
          purple: '#AF52DE',
          red: '#FF3B30',
          teal: '#30B0C7',
          yellow: '#FFCC00',
          gray: '#8E8E93',
        },
        // Semantic tokens driven by CSS variables (light/dark aware)
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        label: 'rgb(var(--label) / <alpha-value>)',
        'label-2': 'rgb(var(--label-2) / <alpha-value>)',
        'label-3': 'rgb(var(--label-3) / <alpha-value>)',
        separator: 'rgb(var(--separator) / <alpha-value>)',
        fill: 'rgb(var(--fill) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Inter',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['SF Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // iOS type ramp
        caption2: ['11px', { lineHeight: '13px', letterSpacing: '0.06px' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0px' }],
        footnote: ['13px', { lineHeight: '18px', letterSpacing: '-0.08px' }],
        subhead: ['15px', { lineHeight: '20px', letterSpacing: '-0.24px' }],
        callout: ['16px', { lineHeight: '21px', letterSpacing: '-0.32px' }],
        body: ['17px', { lineHeight: '22px', letterSpacing: '-0.41px' }],
        headline: ['17px', { lineHeight: '22px', letterSpacing: '-0.41px', fontWeight: '600' }],
        title3: ['20px', { lineHeight: '25px', letterSpacing: '0.38px' }],
        title2: ['22px', { lineHeight: '28px', letterSpacing: '0.35px' }],
        title1: ['28px', { lineHeight: '34px', letterSpacing: '0.36px' }],
        large: ['34px', { lineHeight: '41px', letterSpacing: '0.37px' }],
      },
      borderRadius: {
        ios: '10px',
        card: '14px',
        sheet: '20px',
        continuous: '22px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
        raised: '0 2px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.10)',
        sheet: '0 -1px 0 rgba(0,0,0,0.06), 0 -12px 40px rgba(0,0,0,0.18)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
        tabbar: '49px',
        navbar: '44px',
      },
      backdropBlur: {
        ios: '20px',
      },
      keyframes: {
        'sheet-in': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
