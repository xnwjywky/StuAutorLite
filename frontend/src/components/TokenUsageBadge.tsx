/** 首页右上角 Token 使用量统计 — 小弹窗展示累计消耗 */
import { useEffect, useRef, useState } from "react";
import { getTokenUsage } from "../api/service";

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  calls: number;
  model: string;
  since: number | null;
}

/** 紧凑格式化：1234 → "1.2k"，12345 → "12.3k" */
function compact(n: number): string {
  if (n >= 100000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}
        {sub && <span className="ml-1 text-[10px] text-gray-400 font-normal">{sub}</span>}
      </span>
    </div>
  );
}

export default function TokenUsageBadge() {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [offline, setOffline] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try {
      const u = await getTokenUsage();
      setUsage(u);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  // 点击外部关闭弹窗
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const total = usage?.total_tokens ?? 0;
  const sinceStr = usage?.since
    ? new Date(usage.since * 1000).toLocaleDateString("zh-CN")
    : "—";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) refresh(); }}
        title="Token 使用量统计"
        className="shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ml-2 flex items-center gap-1.5
          text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      >
        <span className="text-xs">🪙</span>
        <span className="font-medium">{offline ? "—" : compact(total)} <span className="text-[10px] text-gray-400">tokens</span></span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-800 text-sm">Token 使用量</h3>
            <span className="text-[10px] text-gray-400">{usage?.model || "未配置模型"}</span>
          </div>

          {offline || !usage ? (
            <p className="text-sm text-gray-400 py-3 text-center">
              {offline ? "后端不可用，无法获取统计" : "暂无 LLM 调用记录"}
            </p>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl p-3 mb-2 text-center">
                <div className="text-2xl font-extrabold text-gray-900">{fmt(total)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">累计消耗 Tokens</div>
              </div>
              <Row label="输入 Tokens" value={fmt(usage.prompt_tokens)} />
              <Row label="输出 Tokens" value={fmt(usage.completion_tokens)} />
              <Row label="LLM 调用次数" value={fmt(usage.calls)} sub="次" />
              <Row label="统计起始" value={sinceStr} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
