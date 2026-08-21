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
          'Inter Variable',
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
        // The iOS text styles at their real sizes. Body is 17px because that
        // is what the platform reads like, and tracking loosens as type
        // shrinks rather than tightening — the opposite of the sharp ramp.
        caption2: ['11px', { lineHeight: '13px', letterSpacing: '0.006em' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0' }],
        footnote: ['13px', { lineHeight: '18px', letterSpacing: '-0.006em' }],
        subhead: ['15px', { lineHeight: '20px', letterSpacing: '-0.012em' }],
        callout: ['16px', { lineHeight: '21px', letterSpacing: '-0.018em' }],
        body: ['17px', { lineHeight: '22px', letterSpacing: '-0.022em' }],
        headline: ['17px', { lineHeight: '22px', letterSpacing: '-0.022em', fontWeight: '600' }],
        title3: ['20px', { lineHeight: '25px', letterSpacing: '-0.026em' }],
        title2: ['22px', { lineHeight: '28px', letterSpacing: '-0.028em' }],
        title1: ['28px', { lineHeight: '34px', letterSpacing: '-0.032em' }],
        large: ['34px', { lineHeight: '41px', letterSpacing: '-0.037em' }],
      },
      // Continuous corners. A grouped list card is 10, a floating card 14, a
      // sheet 16 — and pills are round again.
      borderRadius: {
        ios: '10px',
        card: '14px',
        sheet: '16px',
        continuous: '12px',
        field: '10px',
      },
      boxShadow: {
        // Structure comes from elevation against the grouped background, not
        // from a hairline drawn around every box.
        card: '0 1px 2px rgb(16 16 18 / 0.04), 0 6px 16px -8px rgb(16 16 18 / 0.10)',
        raised: '0 2px 6px rgb(16 16 18 / 0.06), 0 16px 40px -12px rgb(16 16 18 / 0.18)',
        sheet: '0 -12px 44px rgb(16 16 18 / 0.20)',
        control: '0 1px 2px rgb(16 16 18 / 0.10)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
        // Platform metrics: 49pt tab bar, 44pt nav bar.
        tabbar: '49px',
        navbar: '44px',
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
