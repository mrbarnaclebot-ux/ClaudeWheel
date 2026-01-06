/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'void': '#06060a',
        'bg-primary': '#0d0d12',
        'bg-secondary': '#13131a',
        'bg-card': '#1a1a24',
        'bg-card-hover': '#22222e',
        'accent': {
          primary: '#e8956a',
          secondary: '#d4a574',
          tertiary: '#cc785c',
        },
        'accent-cyan': '#4ecdc4',
        'success': '#3fb950',
        'error': '#f85149',
        'text': {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#484f58',
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
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(232, 149, 106, 0.4)' },
          '50%': { opacity: 0.8, boxShadow: '0 0 40px rgba(232, 149, 106, 0.6)' },
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
