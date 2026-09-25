/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Menlo', 'monospace'],
      },
      colors: {
        nan: {
          bg:        '#0A0A0F',
          surface:   '#111118',
          surface2:  '#15151D',
          border:    'rgba(37,99,235,0.14)',
          border2:   'rgba(37,99,235,0.22)',
          accent:    '#2563EB',
          accent2:   '#1D4ED8',
          accent3:   '#60A5FA',
          accent4:   '#93C5FD',
          soft:      'rgba(37,99,235,0.12)',
          text:      '#F4F4F8',
          text2:     '#9AA0B0',
          text3:     '#64748B',
          success:   '#22C55E',
          danger:    '#ef4444',
          gold:      '#F59E0B',
        },
      },
      borderRadius: {
        nan:    '14px',
        'nan-sm': '10px',
      },
      animation: {
        'nan-up':    'nan-up 0.28s ease both',
        'nan-fade':  'nan-fade 0.2s ease both',
        'nan-pulse': 'nan-pulse 2s ease infinite',
        'nan-spin':  'nan-spin 0.8s linear infinite',
      },
      keyframes: {
        'nan-up':   { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'nan-fade': { from: { opacity: '0' }, to: { opacity: '1' } },
        'nan-pulse':{ '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        'nan-spin': { to: { transform: 'rotate(360deg)' } },
      },
      backgroundImage: {
        'nan-glow': 'radial-gradient(ellipse 900px 500px at 22% -10%, rgba(37,99,235,0.18), transparent 60%), radial-gradient(ellipse 700px 500px at 85% 15%, rgba(37,99,235,0.09), transparent 60%)',
        'nan-card': 'linear-gradient(145deg,#1a1a1a 0%,#111111 50%,#1a1a1a 100%)',
        'nan-cta':  'linear-gradient(135deg, rgba(37,99,235,0.16), rgba(37,99,235,0.05))',
      },
    },
  },
  plugins: [],
}
