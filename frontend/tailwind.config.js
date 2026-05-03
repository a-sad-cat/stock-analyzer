/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // 确保 antd 的样式不会被 Tailwind 覆盖
  corePlugins: {
    preflight: false,
  },
}
