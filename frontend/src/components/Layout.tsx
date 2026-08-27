import { Link, useLocation } from "react-router-dom";
import { useBackendHealth } from "../hooks/useBackendHealth";
import TokenUsageBadge from "./TokenUsageBadge";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { path: "/", label: "发现" },
  { path: "/profile", label: "画像" },
  { path: "/archive", label: "档案" },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const { online, checking, lastError, detectedUrl, retryNow } = useBackendHealth();
  const isActive = (path: string) =>
    path === "/"
      ? pathname === "/"
      : pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-paper">
      {/* 顶部导航（分界线颜色跟随主题：米色=黑色，纯白=浅灰） */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b" style={{ backgroundColor: "var(--app-navbar-bg)", borderColor: "var(--app-divider)" }}>
        <div className="max-w-6xl mx-auto px-4 flex items-center h-14">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 font-bold text-gray-900 mr-8 whitespace-nowrap shrink-0"
          >
            <span className="w-7 h-7 rounded-lg bg-gray-900 text-white text-xs flex items-center justify-center">
              S
            </span>
            StuAutorLite
          </Link>

          {/* 导航项 */}
          <nav className="flex items-center gap-1 flex-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  isActive(item.path)
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* 右侧配置入口 */}
          <ThemeToggle />
          <TokenUsageBadge />
          <Link
            to="/agent-config"
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ml-2 ${
              isActive("/agent-config") ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
          >
            ⚙️ Agent 配置
          </Link>
        </div>
      </header>

      {/* 后端不可用横幅 */}
      {!online && !checking && (
        <div className="sticky top-14 z-40 bg-red-50 border-b border-red-200">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-red-700 min-w-0">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="font-medium shrink-0">后端服务不可用</span>
              <span className="text-red-500 text-xs truncate hidden sm:inline">
                {lastError || "无法连接到后端 API"}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {detectedUrl && (
                <span className="text-[10px] text-gray-400 hidden md:inline">{detectedUrl}</span>
              )}
              <button
                onClick={retryNow}
                className="text-xs px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-full font-medium transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
