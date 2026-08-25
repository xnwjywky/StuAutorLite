/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 按页面配置协调配色：只有「浅色填充/发丝线」色阶（gray-50/100/200）随主题
        // 走暖色变量（见 index.css），让米黄背景上的浅灰填充与分割线更协调；
        // 卡片保持纯白（不重映射 white）、正文与深色 UI 保持中性灰不变（gray-300~900）。
        gray: {
          50: "rgb(var(--app-gray-50) / <alpha-value>)",
          100: "rgb(var(--app-gray-100) / <alpha-value>)",
          200: "rgb(var(--app-gray-200) / <alpha-value>)",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
        },
        // DeepSeek 平台品牌蓝（dsw-static-deepseek 色阶，从 platform.deepseek.com 提取）
        primary: {
          50: "#edf3fe",
          100: "#e4edfd",
          200: "#d3e2ff",
          300: "#b7c8fe",
          400: "#679efe",
          450: "#5686fe", // 官方主按钮 hover 色（deepseek-450）
          500: "#3964fe",
          600: "#4868b2",
          700: "#2f4c8f",
          800: "#34415b",
          900: "#283142",
        },
        // 全局页面底色（动态主题）：米黄 #f5ecd0 / 纯白 #ffffff，由 index.css 变量控制
        paper: "var(--app-bg)",
      },
    },
  },
  plugins: [],
};
