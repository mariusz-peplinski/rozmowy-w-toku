import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderWidth: {
        3: '3px',
      },
      spacing: {
        13: '3.25rem',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
