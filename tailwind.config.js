/** @type {import('tailwindcss').Config} */
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./agemdar.html",
    "./**/*.{js,ts,jsx,tsx}",
    // "./movie-details.html", // <--- Remova esta linha
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