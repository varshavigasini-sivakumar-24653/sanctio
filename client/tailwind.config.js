/** Sanctio design system — premium enterprise SaaS palette.
 * Dark mode is toggled by the existing data-theme attribute (see lib/providers.jsx),
 * not a class, so darkMode targets that attribute selector directly. */
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          wash: '#EEF0FF',
        },
        success: { DEFAULT: '#10B981', wash: '#E7F9F1' },
        warning: { DEFAULT: '#F59E0B', wash: '#FEF6E7' },
        danger: { DEFAULT: '#EF4444', wash: '#FDEDED' },
        serious: { DEFAULT: '#F97316', wash: '#FFF1E7' },
        violet: { DEFAULT: '#8B5CF6', wash: '#F3EEFF' },
        info: { DEFAULT: '#0EA5E9', wash: '#E6F6FE' },
        navy: {
          DEFAULT: '#0B1220',
          soft: '#111A2E',
          border: 'rgba(247, 248, 252, 0.08)',
        },
        surface: {
          page: '#F8FAFC',
          card: '#FFFFFF',
          sunken: '#F1F5F9',
          border: '#E5E7EB',
        },
        ink: {
          DEFAULT: '#0F172A',
          soft: '#475569',
          muted: '#94A3B8',
        },
      },
      borderRadius: {
        card: '16px',
        control: '10px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03)',
        card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        lift: '0 12px 24px -8px rgba(15, 23, 42, 0.16), 0 4px 8px -2px rgba(15, 23, 42, 0.06)',
        glow: '0 0 0 1px rgba(79, 70, 229, 0.12), 0 8px 24px -6px rgba(79, 70, 229, 0.28)',
        pop: '0 12px 32px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0 50%' },
        },
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'fade-up': 'fade-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
