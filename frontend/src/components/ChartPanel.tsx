import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

type ChartData = Record<string, any>;

// DeepSeek 平台图表色板（蓝/绿/琥珀/红，见 platform.deepseek.com 静态色阶）
const COLORS = ["#3964fe", "#22c55e", "#f7ad31", "#f25a5a", "#60a5fa", "#b7c8fe"];

interface ChartPanelProps {
  data?: ChartData[];
  xKey?: string;
  /** 单个指标模式：只显示一个 bar，多个算法对比 */
  singleMetric?: { key: string; label: string };
  /** 多指标模式：多个 bar 叠加 */
  bars?: { key: string; name: string; color: string }[];
}

export default function ChartPanel({ data: rawData, xKey = "algorithm", singleMetric, bars }: ChartPanelProps) {
  const data = rawData ?? [];

  // P2：空数据时展示明确提示，绝不回退硬编码 demo 数据（会误导学生以为这是真实实验结果）
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{singleMetric?.label ?? "实验结果对比"}</h3>
        <div className="py-10 text-center text-sm text-gray-400">暂无实验数据 — 请先运行实验后再查看图表</div>
      </div>
    );
  }

  if (singleMetric) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{singleMetric.label}</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} type="number" domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]} />
            <Tooltip contentStyle={{ backgroundColor: "var(--app-card-bg)", borderColor: "var(--app-divider)", color: "var(--app-text)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey={singleMetric.key} name={singleMetric.label} fill="#3964fe" radius={[3, 3, 0, 0]}>
              {data.map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const BARS = bars ?? [
    { key: "expanded_nodes", name: "搜索节点数", color: "#3964fe" },
    { key: "path_length", name: "路径长度", color: "#22c55e" },
    { key: "runtime_ms", name: "运行时间 (ms)", color: "#f7ad31" },
  ];

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">实验结果对比</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} />
          <YAxis type="number" domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]} />
          <Tooltip />
          {BARS.map((bar) => <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
