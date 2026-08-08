/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1e40af',
        secondary: '#0891b2',
        danger: '#dc2626',
        success: '#16a34a',
        warning: '#ea580c',
      },
    },
  },
  plugins: [],
}
