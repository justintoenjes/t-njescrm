import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      zIndex: { '60': '60' },
      colors: {
        tc: {
          blue: '#76BDD3',
          dark: '#062727',
          light: '#F0F8FB',
          gray: '#999999',
        },
      },
      fontFamily: {
        sans: ['Mulish', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
