/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
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
      },
      keyframes: {
        slideUp: { from: { transform: 'translateY(20px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      }
    }
  },
  plugins: [],
  safelist: [
    'bg-green-500',
    'bg-red-500',
    'text-green-400',
    'text-red-400',
    'border-green-500',
    'border-red-500',
    'bg-green-500/15',
    'bg-red-500/15',
    'border-green-500/30',
    'border-red-500/30',
    'hover:bg-green-500/25',
    'hover:bg-red-500/25',
    'hover:border-green-500',
    'hover:border-red-500',
    'aspect-video',
    'object-cover',
    'rounded-xl',
    'rounded-lg',
    'grid-cols-1',
    'sm:grid-cols-2',
    'lg:grid-cols-3',
    'xl:grid-cols-4',
  ]
}