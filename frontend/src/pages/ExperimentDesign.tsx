/** 实验设计 — 顶部导航预览页 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import AlgorithmCard from "../components/AlgorithmCard";
import { createSession } from "../api/service";
import type { AlgorithmType } from "../types";

const ALGOS: { key: AlgorithmType; name: string; description: string; pros: string[]; cons: string[] }[] = [
  { key: "BFS", name: "BFS", description: "一层一层找，通常能找到最短路径", pros: ["保证最短路径", "结果稳定"], cons: ["搜索节点较多"] },
  { key: "DFS", name: "DFS", description: "一条路走到底，不行再回头", pros: ["可能很快", "内存占用小"], cons: ["不一定最短"] },
  { key: "A*", name: "A*", description: "根据离终点的距离聪明地搜索", pros: ["搜索效率高", "保证最短路径"], cons: ["依赖启发函数"] },
  { key: "RANDOM", name: "Random Walk", description: "随便走，用作对比 baseline", pros: ["简单直观"], cons: ["成功率低"] },
];

export default function ExperimentDesign() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<AlgorithmType>>(new Set(["BFS", "A*"]));

  const toggle = (k: AlgorithmType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const goWorkbench = async () => {
    try {
      const s = await createSession();
      const sid = (s as any).id ?? `demo-${Date.now()}`;
      navigate(`/workbench/${sid}`);
    } catch {
      navigate(`/workbench/demo-${Date.now()}`);
    }
  };

  return (
    <Layout>
      <StageContainer step={4} title="设计实验">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">我要比较的算法</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ALGOS.map((a) => (
              <AlgorithmCard key={a.key} name={a.name} description={a.description}
                selected={selected.has(a.key)} onToggle={() => toggle(a.key)} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">迷宫大小</h3>
            <p className="text-sm text-gray-500">12×12</p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">障碍物比例</h3>
            <p className="text-sm text-gray-500">20%</p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">每组重复</h3>
            <p className="text-sm text-gray-500">5 次</p>
          </div>
        </div>

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览。完整工作台支持参数配置、AI 审查、保存设计等全部功能。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
