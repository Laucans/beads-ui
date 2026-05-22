/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0a0a0f',
          surface: '#0f0f1a',
          border: '#1a1a2e',
          accent: '#00ff88',
          accent2: '#00d4ff',
          warn: '#ff6b35',
          text: '#c0c0c0',
          dim: '#606060',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      boxShadow: {
        'cyber': '0 0 10px rgba(0, 255, 136, 0.3)',
        'cyber-blue': '0 0 10px rgba(0, 212, 255, 0.3)',
      },
    },
  },
  plugins: [],
}

