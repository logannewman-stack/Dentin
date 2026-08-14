/** @type {import('tailwindcss').Config} */

/**
 * Sharp UI.
 *
 * Token names are held stable from the iOS build so screens inherit the new
 * language without edits, but every value is re-cut for software rather than
 * for a phone OS: 14px body instead of 17, radii in the 4–8px range instead
 * of 10–22, and structure carried by hairline borders instead of soft
 * shadows and translucency.
 */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ECFBF9',
          100: '#CFF3EF',
          200: '#A2E6DF',
          300: '#6CD2C9',
          400: '#38B8AE',
          500: '#199C93',
          600: '#0C7D76',
          700: '#0A625E',
          800: '#0B4E4B',
          900: '#0C3F3D',
        },
        ivory: {
          50: '#FDFCFA',
          100: '#F7F5F0',
          200: '#EFEBE2',
          300: '#E2DCCE',
          400: '#CFC6B2',
        },
        // Status, pulled back from iOS saturation so they read as data, not UI.
        ios: {
          blue: '#2D6FF7',
          green: '#1F9D55',
          indigo: '#5B5BD6',
          orange: '#D97706',
          pink: '#DB2777',
          purple: '#8B5CF6',
          red: '#DC2626',
          teal: '#0D9488',
          yellow: '#CA8A04',
          gray: '#8A8A94',
        },
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        label: 'rgb(var(--label) / <alpha-value>)',
        'label-2': 'rgb(var(--label-2) / <alpha-value>)',
        'label-3': 'rgb(var(--label-3) / <alpha-value>)',
        separator: 'rgb(var(--separator) / <alpha-value>)',
        line: 'rgb(var(--separator) / <alpha-value>)',
        fill: 'rgb(var(--fill) / <alpha-value>)',
        viz: {
          1: 'rgb(var(--viz-1) / <alpha-value>)',
          2: 'rgb(var(--viz-2) / <alpha-value>)',
          grid: 'rgb(var(--viz-grid) / <alpha-value>)',
          axis: 'rgb(var(--viz-axis) / <alpha-value>)',
          muted: 'rgb(var(--viz-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'JetBrains Mono',
          'Menlo',
          'monospace',
        ],
      },
      /**
       * A software type ramp. Body sits at 14px, micro-labels at 10–11px with
       * open tracking, and display sizes tighten as they grow — the opposite
       * of the iOS ramp, which loosens.
       */
      fontSize: {
        caption2: ['10px', { lineHeight: '13px', letterSpacing: '0.04em' }],
        caption: ['11px', { lineHeight: '15px', letterSpacing: '0.01em' }],
        footnote: ['12px', { lineHeight: '17px', letterSpacing: '0' }],
        subhead: ['13px', { lineHeight: '18px', letterSpacing: '-0.005em' }],
        callout: ['13px', { lineHeight: '18px', letterSpacing: '-0.005em' }],
        body: ['14px', { lineHeight: '20px', letterSpacing: '-0.008em' }],
        headline: ['14px', { lineHeight: '20px', letterSpacing: '-0.011em', fontWeight: '600' }],
        title3: ['16px', { lineHeight: '22px', letterSpacing: '-0.014em' }],
        title2: ['20px', { lineHeight: '26px', letterSpacing: '-0.019em' }],
        title1: ['24px', { lineHeight: '30px', letterSpacing: '-0.022em' }],
        large: ['30px', { lineHeight: '36px', letterSpacing: '-0.026em' }],
      },
      // Sharp by default. Enough radius to avoid a jagged 1px corner on a
      // hairline border, and no more than that.
      borderRadius: {
        ios: '3px',
        card: '4px',
        sheet: '6px',
        continuous: '4px',
      },
      boxShadow: {
        // Structure comes from borders; shadows are reserved for things that
        // genuinely float above the page.
        card: '0 1px 2px rgb(16 16 18 / 0.04)',
        raised: '0 1px 3px rgb(16 16 18 / 0.08), 0 8px 24px rgb(16 16 18 / 0.10)',
        sheet: '0 -1px 0 rgb(var(--separator)), 0 -12px 40px rgb(16 16 18 / 0.18)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
        tabbar: '52px',
        navbar: '48px',
      },
      backdropBlur: {
        ios: '12px',
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
        'sheet-in': 'sheet-in 0.22s cubic-bezier(0.2, 0, 0, 1)',
        shimmer: 'shimmer 1.4s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      transitionTimingFunction: {
        sharp: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
