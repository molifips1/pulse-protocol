/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        pulse: {
          red: '#FF2D55',
          green: '#00F5A0',
          gold: '#FFD60A',
          dark: '#080810',
          card: '#0E0E1A',
          border: '#1A1A2E',
          muted: '#3A3A5C',
        }
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'odds-flash': 'oddsFlash 0.6s ease-out',
      },
      keyframes: {
        slideUp: { from: { transform: 'translateY(20px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        oddsFlash: { '0%,100%': { color: 'inherit' }, '50%': { color: '#FFD60A' } },
      }
    }
  },
  plugins: []
}
