/** @type {import('tailwindcss').Config} */
// tailwind.config.js
export default {
  content: [
    "./*.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bacground: '#c7b88b',
        bacground_2: '#EDF5F2',
        black_2: '#262626',
      },
    },
  },
  plugins: [],
}