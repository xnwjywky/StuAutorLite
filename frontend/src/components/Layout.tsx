import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/", label: "发现" },
  { path: "/profile", label: "科研能力画像" },
  { path: "/archive", label: "研究档案" },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const isActive = (path: string) =>
    path === "/"
      ? pathname === "/"
      : pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
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

      <main>{children}</main>
    </div>
  );
}
