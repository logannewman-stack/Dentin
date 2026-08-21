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
        /**
         * The actual UIColor system palette, not a desaturated print of it.
         * These are the light-mode values; `--ios-*` in index.css shifts them
         * for dark mode the way the platform does, so anything reaching for
         * `ios-green` gets the right one automatically.
         */
        ios: {
          blue: 'rgb(var(--ios-blue) / <alpha-value>)',
          green: 'rgb(var(--ios-green) / <alpha-value>)',
          indigo: 'rgb(var(--ios-indigo) / <alpha-value>)',
          orange: 'rgb(var(--ios-orange) / <alpha-value>)',
          pink: 'rgb(var(--ios-pink) / <alpha-value>)',
          purple: 'rgb(var(--ios-purple) / <alpha-value>)',
          red: 'rgb(var(--ios-red) / <alpha-value>)',
          teal: 'rgb(var(--ios-teal) / <alpha-value>)',
          yellow: 'rgb(var(--ios-yellow) / <alpha-value>)',
          gray: 'rgb(var(--ios-gray) / <alpha-value>)',
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
        /**
         * SF first, and it has to be first.
         *
         * Inter is a fine SF impersonation and it is what every non-Apple
         * device will get — but on an iPhone, iPad or Mac the real thing is
         * already installed, and no substitute reads as native beside it. SF
         * also brings optical sizing and true tabular figures for free.
         *
         * `-apple-system` resolves to SF Pro Text or SF Pro Display at the
         * right optical size automatically; naming the faces directly after
         * it covers browsers that expose them but not the keyword.
         *
         * Apple Color Emoji is named explicitly so emoji render in colour
         * rather than falling through to a monochrome glyph.
         */
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'system-ui',
          'Inter Variable',
          'Inter',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Noto Color Emoji',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'JetBrains Mono',
          'monospace',
        ],
      },
      /**
       * A software type ramp. Body sits at 14px, micro-labels at 10–11px with
       * open tracking, and display sizes tighten as they grow — the opposite
       * of the iOS ramp, which loosens.
       */
      fontSize: {
        // Every step is a variable so the whole ramp can be re-cut by skin:
        // iOS body is 17px, the software body is 14px, and the tracking runs
        // the opposite direction between them.
        caption2: ['var(--fs-caption2)', { lineHeight: 'var(--lh-caption2)', letterSpacing: 'var(--ls-caption2)' }],
        caption: ['var(--fs-caption)', { lineHeight: 'var(--lh-caption)', letterSpacing: 'var(--ls-caption)' }],
        footnote: ['var(--fs-footnote)', { lineHeight: 'var(--lh-footnote)', letterSpacing: 'var(--ls-footnote)' }],
        subhead: ['var(--fs-subhead)', { lineHeight: 'var(--lh-subhead)', letterSpacing: 'var(--ls-subhead)' }],
        callout: ['var(--fs-callout)', { lineHeight: 'var(--lh-callout)', letterSpacing: 'var(--ls-callout)' }],
        body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)', letterSpacing: 'var(--ls-body)' }],
        headline: ['var(--fs-body)', { lineHeight: 'var(--lh-body)', letterSpacing: 'var(--ls-body)', fontWeight: '600' }],
        title3: ['var(--fs-title3)', { lineHeight: 'var(--lh-title3)', letterSpacing: 'var(--ls-title3)' }],
        title2: ['var(--fs-title2)', { lineHeight: 'var(--lh-title2)', letterSpacing: 'var(--ls-title2)' }],
        title1: ['var(--fs-title1)', { lineHeight: 'var(--lh-title1)', letterSpacing: 'var(--ls-title1)' }],
        large: ['var(--fs-large)', { lineHeight: 'var(--lh-large)', letterSpacing: 'var(--ls-large)' }],
      },
      // Radii are skin-driven: the software language is nearly square, iOS
      // uses continuous corners. Pills go from a 2px chip to a real capsule.
      borderRadius: {
        ios: 'var(--r-control)',
        card: 'var(--r-panel)',
        sheet: 'var(--r-sheet)',
        continuous: 'var(--r-continuous)',
        field: 'var(--r-field)',
        chip: 'var(--r-chip)',
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
        tabbar: 'var(--h-tabbar)',
        navbar: 'var(--h-navbar)',
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
