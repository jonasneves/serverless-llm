/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // `xs` sits below Tailwind's default `sm` (640px) for fine-grained
      // control on small phones. Some components already use `xs:` —
      // without this breakpoint defined those classes silently no-op.
      screens: {
        xs: '475px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
