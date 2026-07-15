import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { createSession } from "../api/service";

// ═══════════════════════════════════════════════════════════
// 任务数据
// ═══════════════════════════════════════════════════════════

interface TaskCard {
  id: string;
  name: string;
  description: string;
  difficulty: "入门" | "进阶" | "挑战";
  icon: string;
  gradient: string;
  concepts: string[];
  available: boolean;
}

const TASKS: TaskCard[] = [
  { id: "maze_pathfinding", name: "迷宫寻路", description: "比较 BFS、DFS、A* 等算法，看谁更快找到出口",
    difficulty: "入门", icon: "🧭", gradient: "from-violet-500 to-purple-600",
    concepts: ["算法比较", "实验设计", "数据分析"], available: true },
  { id: "guess_number", name: "猜数字策略", description: "用二分查找等策略，用最少的次数猜中目标数字",
    difficulty: "入门", icon: "🎯", gradient: "from-emerald-500 to-teal-600",
    concepts: ["二分查找", "策略优化", "效率分析"], available: true },
  { id: "simple_classification", name: "简单分类", description: "学习 KNN 和决策树，让计算机自动识别不同物品",
    difficulty: "入门", icon: "📊", gradient: "from-orange-500 to-amber-600",
    concepts: ["KNN", "决策树", "分类任务"], available: true },
  { id: "shape_recognition", name: "图形识别", description: "识别像素化圆形/正方形/三角形，对比模板匹配、KNN 和特征提取",
    difficulty: "进阶", icon: "👁️", gradient: "from-sky-500 to-blue-600",
    concepts: ["模板匹配", "像素KNN", "特征提取"], available: true },
  { id: "robot_obstacle", name: "机器人避障", description: "让虚拟机器人在障碍物中自主导航，学会避开陷阱",
    difficulty: "进阶", icon: "🤖", gradient: "from-rose-500 to-pink-600",
    concepts: ["路径规划", "传感器", "自主导航"], available: false },
  { id: "visual_algo_compare", name: "可视化算法比较", description: "排序算法（冒泡/归并/快排）+ 字符串搜索（KMP/BM/RK）双模式",
    difficulty: "入门", icon: "📈", gradient: "from-indigo-500 to-blue-700",
    concepts: ["排序算法", "字符串搜索", "算法复杂度"], available: true },
];

const DIFFICULTY_STYLE: Record<TaskCard["difficulty"], string> = {
  入门: "bg-green-100 text-green-700", 进阶: "bg-yellow-100 text-yellow-700", 挑战: "bg-red-100 text-red-700",
};

// ═══════════════════════════════════════════════════════════

export default function TaskSelect() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);

  const handleStart = async (taskId: string) => {
    setStarting(taskId);
    try {
      const session = await createSession(taskId);
      const sid = typeof session.id === "number" ? session.id : (session as any).session_id;
      const route = taskId === "simple_classification"
        ? `/workbench-classify/${sid}`
        : taskId === "guess_number"
        ? `/workbench-guess/${sid}`
        : taskId === "visual_algo_compare"
        ? `/workbench-sort/${sid}`
        : taskId === "shape_recognition"
        ? `/workbench-shape/${sid}`
        : `/workbench/${sid}`;
      navigate(route);
    } catch {
      navigate(`/workbench/demo-${Date.now()}`);
    } finally {
      setStarting(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-12">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">发现研究任务</h1>
          <p className="mt-2 text-gray-500 text-base">选择一个感兴趣的任务，开启你的 AI 科研之旅</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TASKS.map((task) => (
            <article key={task.id}
              className="group relative bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">

              {/* 渐变 header */}
              <div className={`h-28 bg-gradient-to-br ${task.gradient} flex items-center justify-center relative`}>
                <span className="text-5xl drop-shadow-sm">{task.icon}</span>
                <span className={`absolute top-3 right-3 text-[11px] px-2.5 py-0.5 rounded-full font-medium ${DIFFICULTY_STYLE[task.difficulty]} shadow-sm`}>
                  {task.difficulty}
                </span>
                {!task.available && (
                  <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
                    <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">即将开放</span>
                  </div>
                )}
              </div>

              {/* 正文 */}
              <div className="p-4">
                <h3 className="text-base font-bold text-gray-800 mb-1.5 group-hover:text-gray-600 transition-colors">{task.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-3 line-clamp-2">{task.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {task.concepts.map((c) => (
                    <span key={c} className="text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md border border-gray-100">{c}</span>
                  ))}
                </div>
                {task.available ? (
                  <button className="w-full bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-gray-800 active:scale-[0.98] transition-all"
                    onClick={() => handleStart(task.id)} disabled={starting === task.id}>
                    {starting === task.id ? "创建会话中..." : "开始研究"}
                  </button>
                ) : (
                  <button disabled className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-2.5 rounded-xl cursor-not-allowed">敬请期待</button>
                )}
              </div>
            </article>
          ))}
        </div>

        <p className="text-center text-gray-300 text-xs mt-12">
          更多研究任务正在开发中 · 图像分类 · 多臂老虎机 · 强化学习格子世界
        </p>
      </div>
    </Layout>
  );
}
