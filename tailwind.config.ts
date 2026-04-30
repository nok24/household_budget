import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        // design_handoff_kakeibo / variant-a 準拠
        ink: {
          DEFAULT: '#1A1A1A',
          70: 'rgba(26,26,26,0.7)',
          60: 'rgba(26,26,26,0.6)',
          40: 'rgba(26,26,26,0.4)',
        },
        canvas: '#F7F5F1',
        surface: '#FFFFFF',
        sidebar: '#FBF9F5',
        line: 'rgba(26,26,26,0.08)',
        accent: {
          DEFAULT: '#3F5A4A',
          warm: '#B8A78A',
          cool: '#9AA5B1',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        numeric: ['"Inter"', '-apple-system', 'sans-serif'],
      },
      fontFeatureSettings: {
        palt: '"palt" 1',
      },
      borderRadius: {
        card: '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [animate],
};

export default config;
