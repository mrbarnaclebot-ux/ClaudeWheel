/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm dark backgrounds (matching landing page)
        'void': '#0e0804',
        'bg-void': '#0e0804',
        'bg-primary': '#0e0804',
        'bg-secondary': '#1a140f',
        'bg-card': '#1f1810',
        'bg-card-hover': '#2a2420',

        // Wood color palette (updated for orange/copper theme)
        'wood': {
          dark: '#864317',
          medium: '#c95a1a',
          light: '#e67428',
          accent: '#e2aa84',
          highlight: '#f8f0ec',
        },

        // Copper/Bronze accents (updated)
        'copper': '#e2aa84',
        'copper-light': '#f0c8a8',
        'bronze': '#e67428',

        // Primary accent colors (matching landing page)
        'accent': {
          primary: '#e67428',
          secondary: '#c95a1a',
          tertiary: '#864317',
        },
        'accent-cyan': '#e2aa84',

        // Status colors (keep for semantic meaning)
        'success': '#5D8C3E',
        'error': '#A63D2F',
        'warning': '#C9A227',

        // Text hierarchy (matching landing page)
        'text': {
          primary: '#f8f0ec',
          secondary: '#d4ccc6',
          muted: '#7A756B',
        },

        // Borders (updated for new accent)
        'border': {
          subtle: 'rgba(230, 116, 40, 0.12)',
          accent: 'rgba(230, 116, 40, 0.35)',
          glow: 'rgba(230, 116, 40, 0.5)',
        },

        // Semantic colors (updated)
        'wheel': {
          bg: '#0e0804',
          surface: '#0e0804',
          elevated: '#1f1810',
          primary: '#e67428',
          secondary: '#c95a1a',
          accent: '#864317',
          text: '#f8f0ec',
        },

        // Telegram theme colors (fallbacks - updated)
        'telegram-bg': 'var(--tg-theme-bg-color, #0e0804)',
        'telegram-text': 'var(--tg-theme-text-color, #f8f0ec)',
        'telegram-hint': 'var(--tg-theme-hint-color, #7A756B)',
        'telegram-link': 'var(--tg-theme-link-color, #e67428)',
        'telegram-button': 'var(--tg-theme-button-color, #e67428)',
        'telegram-button-text': 'var(--tg-theme-button-text-color, #0e0804)',
        'telegram-secondary-bg': 'var(--tg-theme-secondary-bg-color, #1a140f)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Playfair Display', 'serif'],
        body: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderWidth: {
        '3': '3px',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'spin': 'spin 1s linear infinite',
        'lantern-flicker': 'lanternFlicker 3s ease-in-out infinite',
        'orbit': 'orbit 4s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
        'wheel-spin': 'wheelSpin 30s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(230, 116, 40, 0.4)' },
          '50%': { opacity: 0.8, boxShadow: '0 0 40px rgba(230, 116, 40, 0.6)' },
        },
        slideIn: {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        lanternFlicker: {
          '0%, 100%': {
            boxShadow: '0 0 10px rgba(230, 116, 40, 0.4), 0 0 20px rgba(230, 116, 40, 0.2)',
            opacity: 1,
          },
          '50%': {
            boxShadow: '0 0 15px rgba(230, 116, 40, 0.6), 0 0 30px rgba(230, 116, 40, 0.3)',
            opacity: 0.95,
          },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(120px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(120px) rotate(-360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0 },
        },
        wheelSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      boxShadow: {
        'wood-glow': '0 0 20px rgba(230, 116, 40, 0.4), 0 0 40px rgba(230, 116, 40, 0.2)',
        'wood-glow-strong': '0 0 30px rgba(226, 170, 132, 0.6), 0 0 60px rgba(230, 116, 40, 0.4)',
        'lantern': '0 0 15px rgba(230, 116, 40, 0.5), inset 0 0 10px rgba(230, 116, 40, 0.1)',
      },
      backgroundImage: {
        'wood-grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.015' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
        'wood-gradient': 'linear-gradient(135deg, #864317 0%, #c95a1a 50%, #e67428 100%)',
      },
    },
  },
  plugins: [],
};
