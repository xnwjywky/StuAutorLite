import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

type ChartData = Record<string, any>;

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface ChartPanelProps {
  data?: ChartData[];
  xKey?: string;
  /** 单个指标模式：只显示一个 bar，多个算法对比 */
  singleMetric?: { key: string; label: string };
  /** 多指标模式：多个 bar 叠加 */
  bars?: { key: string; name: string; color: string }[];
}

export default function ChartPanel({ data: rawData, xKey = "algorithm", singleMetric, bars }: ChartPanelProps) {
  const data = rawData?.length ? rawData : DEFAULT_DATA;

  if (singleMetric) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{singleMetric.label}</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey={singleMetric.key} name={singleMetric.label} fill="#3b82f6" radius={[3, 3, 0, 0]}>
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
    { key: "expanded_nodes", name: "搜索节点数", color: "#3b82f6" },
    { key: "path_length", name: "路径长度", color: "#22c55e" },
    { key: "runtime_ms", name: "运行时间 (ms)", color: "#f59e0b" },
  ];

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">实验结果对比</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          {BARS.map((bar) => <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DEFAULT_DATA = [
  { algorithm: "BFS", success_rate: 100, path_length: 24.3, expanded_nodes: 91.2, runtime_ms: 31 },
  { algorithm: "DFS", success_rate: 80, path_length: 37.5, expanded_nodes: 68.4, runtime_ms: 26 },
  { algorithm: "A*", success_rate: 100, path_length: 24.3, expanded_nodes: 42.7, runtime_ms: 18 },
];
