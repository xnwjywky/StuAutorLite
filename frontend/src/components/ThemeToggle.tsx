/** 背景色主题切换按钮 — 纯白 #ffffff ⇄ 米白 #f5ecd0（仅影响全局背景三处：导航栏 / 页面底色 / 工作台） */
import { useEffect, useState } from "react";

const THEME_KEY = "stuautor_theme";
type Theme = "paper" | "light";

function getInitialTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "paper";
  } catch {
    return "paper";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "paper" ? "light" : "paper"));

  const isPaper = theme === "paper";

  return (
    <button
      onClick={toggle}
      title={isPaper ? "切换为纯白背景" : "切换为米白背景"}
      aria-label="切换背景色"
      className="shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ml-2 flex items-center gap-1.5
        text-gray-500 hover:text-gray-900 hover:bg-gray-100"
    >
      <span
        className="inline-block w-4 h-4 rounded-full border border-gray-300"
        style={{ backgroundColor: isPaper ? "#f5ecd0" : "#ffffff" }}
      />
      <span className="text-xs">{isPaper ? "米白" : "纯白"}</span>
    </button>
  );
}
