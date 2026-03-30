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
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        pm: {
          bg: '#FFFFFF',
          surface: '#F7F8FA',
          border: '#E5E7EB',
          text: '#111827',
          muted: '#6B7280',
          accent: '#6366F1',
          'live-red': '#EF4444',
          'yes-bg': '#EFF6FF',
          'yes': '#2563EB',
          'no-bg': '#FEF2F2',
          'no': '#DC2626',
        }
      },
      animation: {
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
}
