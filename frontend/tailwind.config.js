/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1677ff', light: '#e6f4ff', dark: '#0958d9' },
        danger: { DEFAULT: '#f5222d', light: '#fff1f0' },
        success: { DEFAULT: '#52c41a', light: '#f6ffed' },
        warning: { DEFAULT: '#fa8c16', light: '#fff7e6' },
        bg: {
          page: '#f0f2f5',
          card: '#ffffff',
          input: '#f5f7fa',
          overlay: 'rgba(0,0,0,0.45)',
        },
        text: {
          primary: '#1f2937',
          secondary: '#6b7280',
          hint: '#9ca3af',
          disabled: '#d1d5db',
        },
        border: { DEFAULT: '#e5e7eb', light: '#f3f4f6' },
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '22px' }],
        lg: ['17px', { lineHeight: '24px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
        '4xl': ['36px', { lineHeight: '44px' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
        float: '0 8px 24px rgba(0,0,0,0.10)',
        header: '0 1px 0 rgba(0,0,0,0.04)',
        tab: '0 -2px 12px rgba(0,0,0,0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease',
        'slide-up': 'slideUp 0.35s ease',
        'slide-left': 'slideLeft 0.35s ease',
        'slide-right': 'slideRight 0.35s ease',
        'scale-in': 'scaleIn 0.2s ease',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideLeft: { '0%': { opacity: '0', transform: 'translateX(24px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideRight: { '0%': { opacity: '0', transform: 'translateX(-24px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backgroundImage: {
        'gradient-up': 'linear-gradient(135deg, #fff1f0 0%, #ffffff 100%)',
        'gradient-down': 'linear-gradient(135deg, #f6ffed 0%, #ffffff 100%)',
        'gradient-primary': 'linear-gradient(135deg, #e6f4ff 0%, #ffffff 100%)',
      },
      backgroundSize: {
        '200': '200% 100%',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
