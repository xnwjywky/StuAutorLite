/** 背景色主题切换 — 调色板图标按钮 + 下拉选色（米白 #f5ecd0 / 纯白 #ffffff / 灰白 #f5f6f7） */
import { useEffect, useRef, useState } from "react";

const THEME_KEY = "stuautor_theme";
type Theme = "paper" | "light" | "gray";

const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: "paper", label: "米白", color: "#f5ecd0" },
  { id: "light", label: "纯白", color: "#ffffff" },
  { id: "gray", label: "灰白", color: "#f5f6f7" },
];

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    // 兼容旧版保存的 "dark"（误加的深色主题），回落为默认米白
    return saved === "light" || saved === "gray" ? saved : "paper";
  } catch {
    return "paper";
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // :root 默认即米白主题，light/dark 走对应变量块；paper 直接写 "paper"（无匹配块 → :root 生效）
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  // 点击下拉外部时关闭
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-2 shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="切换背景色"
        aria-label="切换背景色"
        aria-expanded={open}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center
          text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        {/* 调色板图标（内联 SVG，避免引入图标库依赖） */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10c0-1.7-1.3-3-3-3h-2.2a2.2 2.2 0 0 1-1.6-3.7l.4-.4A2.2 2.2 0 0 0 13 2.3 10 10 0 0 0 12 2z" />
          <circle cx="7.5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" />
          <circle cx="16.5" cy="11" r="1" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-14 rounded-lg bg-white shadow-lg border border-gray-200 py-1.5 flex flex-col items-center gap-1.5 z-50">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id); setOpen(false); }}
              title={t.label}
              aria-label={`背景色：${t.label}`}
              className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${
                theme === t.id
                  ? "border-gray-800 ring-2 ring-gray-800 ring-offset-1"
                  : "border-gray-300 hover:border-gray-500"
              }`}
            >
              <span className="inline-block w-5 h-5 rounded-full"
                style={{ backgroundColor: t.color }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
