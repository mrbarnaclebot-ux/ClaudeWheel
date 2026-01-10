/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // New warm color palette
        'void': '#191814',
        'bg-primary': '#1f1e19',
        'bg-secondary': '#252420',
        'bg-card': '#2a2822',
        'bg-card-hover': '#35332b',
        'accent': {
          primary: '#f0a381',
          secondary: '#7b462d',
          tertiary: '#e16939',
        },
        'accent-cyan': '#4ecdc4',
        'success': '#3fb950',
        'error': '#f85149',
        'text': {
          primary: '#edece6',
          secondary: '#a8a79f',
          muted: '#6b6a62',
        },
        // Semantic colors
        'wheel': {
          bg: '#191814',
          surface: '#1f1e19',
          elevated: '#2a2822',
          primary: '#f0a381',
          secondary: '#7b462d',
          accent: '#e16939',
          text: '#edece6',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Outfit', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'orbit': 'orbit 4s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(240, 163, 129, 0.4)' },
          '50%': { opacity: 0.8, boxShadow: '0 0 40px rgba(240, 163, 129, 0.6)' },
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
      },
    },
  },
  plugins: [],
}
