/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBF9F4',
        ink: '#1C1B19',
        'ink-soft': '#5B5850',
        indigo: {
          DEFAULT: '#1E2A52',
          600: '#28386B',
          500: '#35447A',
          100: '#E4E7F0',
        },
        gold: {
          DEFAULT: '#C98A2C',
          600: '#B37821',
          100: '#F4E3C2',
        },
        success: '#3F7D58',
        danger: '#B0463A',
        border: '#D8D2C4',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-plex-sans)', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
