/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm dark backgrounds (original)
        'void': '#191814',
        'bg-void': '#191814',
        'bg-primary': '#1f1e19',
        'bg-secondary': '#252420',
        'bg-card': '#2a2822',
        'bg-card-hover': '#35332b',

        // Wood color palette
        'wood': {
          dark: '#654321',
          medium: '#8B4513',
          light: '#CD853F',
          accent: '#DEB887',
          highlight: '#F4A460',
        },

        // Copper/Bronze accents
        'copper': '#B87333',
        'copper-light': '#DA8A67',
        'bronze': '#CD7F32',

        // Legacy accent (for compatibility)
        'accent': {
          primary: '#CD853F',
          secondary: '#8B4513',
          tertiary: '#A0522D',
        },
        'accent-cyan': '#4ecdc4',

        // Status colors
        'success': '#5D8C3E',
        'error': '#A63D2F',
        'warning': '#C9A227',

        // Text hierarchy
        'text': {
          primary: '#F5F0E6',
          secondary: '#C9C2B5',
          muted: '#7A756B',
        },

        // Borders
        'border': {
          subtle: 'rgba(205, 133, 63, 0.12)',
          accent: 'rgba(205, 133, 63, 0.35)',
          glow: 'rgba(205, 133, 63, 0.5)',
        },

        // Semantic colors (legacy support)
        'wheel': {
          bg: '#0f0d0a',
          surface: '#161311',
          elevated: '#231f1b',
          primary: '#CD853F',
          secondary: '#8B4513',
          accent: '#A0522D',
          text: '#F5F0E6',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Playfair Display', 'serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'orbit': 'orbit 4s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'wheel-spin': 'wheelSpin 30s linear infinite',
        'lantern-flicker': 'lanternFlicker 3s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(205, 133, 63, 0.4)' },
          '50%': { opacity: 0.8, boxShadow: '0 0 40px rgba(205, 133, 63, 0.6)' },
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
        slideIn: {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        wheelSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        lanternFlicker: {
          '0%, 100%': {
            boxShadow: '0 0 10px rgba(205, 133, 63, 0.4), 0 0 20px rgba(205, 133, 63, 0.2)',
            opacity: 1,
          },
          '50%': {
            boxShadow: '0 0 15px rgba(205, 133, 63, 0.6), 0 0 30px rgba(205, 133, 63, 0.3)',
            opacity: 0.95,
          },
        },
      },
      boxShadow: {
        'wood-glow': '0 0 20px rgba(205, 133, 63, 0.4), 0 0 40px rgba(205, 133, 63, 0.2)',
        'wood-glow-strong': '0 0 30px rgba(222, 184, 135, 0.6), 0 0 60px rgba(205, 133, 63, 0.4)',
        'lantern': '0 0 15px rgba(205, 133, 63, 0.5), inset 0 0 10px rgba(205, 133, 63, 0.1)',
      },
      backgroundImage: {
        'wood-grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.015' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
        'wood-gradient': 'linear-gradient(135deg, #654321 0%, #8B4513 50%, #CD853F 100%)',
      },
    },
  },
  plugins: [],
}
