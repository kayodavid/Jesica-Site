/** @type {import('tailwindcss').Config} */
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./agemdar.html", // Adicione esta linha
    // ou, para ser mais abrangente:
    // "./*.html",
    "./**/*.{js,ts,jsx,tsx}",
    "./movie-details.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3490dc',
        secondary: '#ffed4a',
        danger: '#e3342f',
        bacground: '#E2E9E6',
        bacground_2: '#EDF5F2',
        black_2: '#262626',
      },
    },
  },
  plugins: [],
}