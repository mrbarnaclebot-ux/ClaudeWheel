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
        // Telegram theme colors
        'telegram-bg': 'var(--tg-theme-bg-color, #1c1c1e)',
        'telegram-text': 'var(--tg-theme-text-color, #ffffff)',
        'telegram-hint': 'var(--tg-theme-hint-color, #8e8e93)',
        'telegram-link': 'var(--tg-theme-link-color, #007aff)',
        'telegram-button': 'var(--tg-theme-button-color, #007aff)',
        'telegram-button-text': 'var(--tg-theme-button-text-color, #ffffff)',
        'telegram-secondary-bg': 'var(--tg-theme-secondary-bg-color, #2c2c2e)',
        // ClaudeWheel brand colors
        'cw-green': {
          50: '#edfff4',
          100: '#d5ffe6',
          200: '#aeffcf',
          300: '#70ffab',
          400: '#2bfd7f',
          500: '#00e65c',
          600: '#00bf4a',
          700: '#00963d',
          800: '#067534',
          900: '#07612d',
          950: '#003717',
        },
      },
      borderWidth: {
        '3': '3px',
      },
    },
  },
  plugins: [],
};
