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
        bacground: '#A88B36',
        bacground_2: '#EDF5F2',
        black_2: '#262626',
      },
    },
  },
  plugins: [],
}