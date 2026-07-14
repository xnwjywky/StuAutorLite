# StuAutorLite 项目交接文档

> 面向中小学生的 AI 科研体验平台。最后更新：2026-07-10

---

## 一、项目概览

**定位**：让学生在可视化沙盒中体验完整科研流程（问题→假设→设计→运行→分析→反思→报告→审稿）。

**启动方式**：
```bash
# 后端 (Python 3.12 + FastAPI)
cd student-autoresearch-lite/backend
source .venv/Scripts/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端 (React 18 + Vite 5)
cd student-autoresearch-lite/frontend
npm run dev

# 测试
cd student-autoresearch-lite
python run_tests.py
```
> 局域网访问：`npm run dev` 和 `--host 0.0.0.0` 后，其他设备通过 `http://<本机IP>:5173` 即可访问。

---

## 二、技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite 5 + Tailwind CSS + Zustand + React Router 6 + Recharts |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy ORM + Pydantic |
| 数据库 | SQLite (`backend/data/stuautor.db`) |
| Agent | OpenAI / Anthropic 双协议 HTTPx 客户端 + DeepSeek / 硅基流动适配 |
| 算法 | 纯 Python（无 NumPy/sklearn 依赖） |
| 测试 | pytest (后端) + vitest + @testing-library/react (前端) |

**关键目录**：
```
backend/app/core/algorithms/    # 8 个迷宫搜索算法
backend/app/core/classification/ # 3 个分类器 + 2D 数据生成
backend/app/core/guessnumber/    # 3 个猜数字策略
backend/app/core/sorting/         # 4 个排序算法（冒泡/选择/归并/快排）
backend/app/core/stringsearch/     # 4 个字符串搜索算法（暴力/KMP/Boyer-Moore/Rabin-Karp）
backend/app/api/routes/          # 10 个路由模块
frontend/src/pages/              # 6 个核心页面 (Workbench / ClassificationWorkbench / GuessNumberWorkbench / SortingWorkbench / TaskSelect)
frontend/src/components/         # 10 个共享组件
frontend/src/stores/             # 6 个 Zustand Store
```

---

## 三、已完成内容

### 3.1 三个实验任务

| 实验 | 算法/策略 | 阶段数 | 路由 | 特点 |
|------|----------|--------|------|------|
| 迷宫寻路 | BFS / DFS / A\* / Dijkstra / 贪心 / 双向BFS / IDDFS / RandomWalk (8个) | 9 阶段 | `/workbench/:id` | Canvas 搜索动画 + 迷宫编辑 + 组别切换 |
| 图像分类 | KNN / 决策树 / 随机基线 (3个) | 9 阶段 | `/workbench-classify/:id` | Canvas 决策边界动画 + blobs/circles/moons 数据 |
| 猜数字 | 二分 / 随机 / 线性 (3个) | 7 阶段 | `/workbench-guess/:id` | 步进式猜测动画 + 算法原理面板 |
| 排序算法 | 冒泡 / 选择 / 归并 / 快排 (4个) | 7 阶段 | `/workbench-sort/:id` | Canvas 数组柱状动画 + 分类对比(暴力法 vs 分治法) |
| 字符串搜索 | 暴力 / KMP / Boyer-Moore / Rabin-Karp (4个) | 7 阶段 | `/workbench-stringsearch/:id` | 文本+模式串滑动对比动画 |

### 3.2 共享能力

- **6 个 AI Agent**：Research Mentor / Experiment Designer / Data Analyst / Reflection / Reviewer / Algorithm Tutor
- **Agent Gateway**：LLM优先→模板降级 / JSON Schema 校验 / 中文输出 / 错误日志
- **API 安全**：输入边界保护（迷宫≤50、试验≤20、样本≤1000、深度≤10）
- **算法原理面板**：三个实验 Stage4 选中卡片后展示解释+类比+关键点+伪代码+优缺
- **LLM 适配**：DeepSeek/SiliconFlow URL 归一化 + model 名称小写化
- **测试**：后端 97 用例 + 前端 62 用例 + `run_tests.py` 统一运行器

### 3.3 MVP 验收（对照设计文档 §19）

| 验收项 | 状态 |
|--------|------|
| 选择迷宫寻路任务 | ✅ |
| 选择/修改研究问题 | ✅ |
| 写出实验假设 | ✅ |
| 设计至少一组算法对比 | ✅ |
| 运行 BFS/DFS/A\*/Random | ✅ (实际 8 算法) |
| 查看路径动画和结果表格 | ✅ |
| 查看算法指标对比 | ✅ |
| 写出结果分析 | ✅ |
| 完成反思 | ✅ |
| 生成研究报告 | ✅ |
| 获得 AI 审稿反馈 | ✅ |

---

## 四、待完成（对照设计文档）

### 高优先级

| 事项 | 对应文档 | 状态 |
|------|----------|------|
| MLP / 小型 CNN 分类器 | §16.2 | 未实现（当前仅 KNN/决策树/随机） |
| 多臂老虎机实验 | §16.3 | 未实现 |
| PDF 导出 | §18.1 P2 | 未实现 |
| 前端防抖（Agent 按钮） | README P1 | 未实现 |
| Archive 重新打开工作台 | README P1 | 未实现 |
| Reflection Agent LLM 接入 | README P1 | 当前使用模板反馈 |

### 中优先级

| 事项 | 对应文档 | 状态 |
|------|----------|------|
| 强化学习格子世界 | §16.4 | 未实现 |
| 简化 AutoML | §16.5 | 未实现 |
| TaskConfig 外置 | README P2 | 三个实验各自独立的 Workbench，尚未复用 |
| 学生画像后端持久化 | §10.9 / §15 | 前端 localStorage，未写数据库 API |
| Markdown 渲染（react-markdown） | README P2 | 当前用 `<pre>` 展示 |

---

## 五、已解决问题记录

### 问题 1：DeepSeek URL 路由 404

- **现象**：`HTTP 404 from https://api.deepseek.com/anthropic/chat/completions`
- **原因**：用户在 Agent 配置中 URL 填写了 `/anthropic` 路径，但系统检测到 `deepseek` 关键词后强制 `provider="openai"`，导致构造出 `.../anthropic/chat/completions` 的错误端点
- **修复**：`backend/app/api/routes/agents.py` `_build_llm()`，检测 `deepseek`/`siliconflow` 时自动将 base URL 中的 `/anthropic` 替换为 `/v1`
- **日期**：2026-07-07

### 问题 2：DeepSeek model 名称 400

- **现象**：`HTTP 400 ... "you passed DeepSeek-V4-Flash"`（要求小写）
- **原因**：用户在配置页输入 `DeepSeek-V4-Flash`，后端透传混合大小写给 API
- **修复**：`_build_llm()` 检测到 `deepseek` 时 `model = model.lower()`
- **日期**：2026-07-10

### 问题 3：Agent 气泡提示缺失

- **现象**：猜数字 Stage2/6 调用 Agent 失败时用户无任何提示，静默降级
- **原因**：`GuessNumberWorkbench.tsx` 未维护 `msg` state 且未传递给 `StageContainer`
- **修复**：新增 `msg` state + `StageContainer agent={msg}` 属性
- **日期**：2026-07-10

### 问题 4：猜数字 Stage7 按钮始终 disabled

- **现象**：总结报告「完成研究」按钮永远不可点击
- **原因**：按钮 `disabled` 属性未移除，且缺少 `complete()` 回调
- **修复**：移除 disabled + 添加 `archiveSession` 归档 + `navigate("/archive")` 跳转
- **日期**：2026-07-10

### 问题 5：分类实验 Stage6 图表无数据

- **现象**：分析结果页柱状图数据全为 0
- **原因**：`ChartPanel` 未传 `bars` prop，回退到迷宫默认指标 `expanded_nodes/path_length/runtime_ms`，与分类字段不匹配
- **修复**：传入分类专属 `bars` 配置 `[{accuracy}, {precision}, {recall}, {f1}]`
- **日期**：2026-07-09

### 问题 6：迷宫编辑标记丢失

- **现象**：编辑迷宫后重新运行，「已编辑」标识消失
- **原因**：`execRun` 完成后重建 `editsRef` 时把 `isEdited` 硬编码为 `false`
- **修复**：新增 `staleEdit` 字段区分「是否编辑过」和「是否已重新计算」；`execRun` 重建时保留 `isEdited` 标记
- **日期**：2026-07-08

### 问题 7：分类动画重复播放

- **现象**：切换组别或页面重渲染时动画无限循环
- **原因**：动画 `useEffect` 每次父组件渲染都重新触发
- **修复**：新增 `autoPlayedRef` 标记首次播放完成，后续直接展示静态帧；`replayKey` 仅用户点击重播时递增
- **日期**：2026-07-10

### 问题 8：LLM JSON 截断

- **现象**：DeepSeek 返回的 JSON 在字段名中间截断，3 次重试全部失败
- **修复**：`max_tokens` 提升到 4096，MAX_RETRIES 降至 1
- **日期**：2026-07-07

---

## 六、快速导航

| 想了解 | 看这个文件 |
|--------|-----------|
| 整体设计 | `../student_autoresearch_lite_design_report.md` |
| 当前进度和启动 | `../README.md` |
| 后端算法实现 | `backend/app/core/algorithms/` 和 `classification/` 和 `guessnumber/` |
| 后端 API | `backend/app/api/routes/` |
| 前端实验流程 | `frontend/src/pages/Workbench.tsx` / `ClassificationWorkbench.tsx` / `GuessNumberWorkbench.tsx` |
| 前端可视化组件 | `frontend/src/components/MazeVisualizer.tsx` / `DecisionBoundary.tsx` |
| Agent 调用链 | `frontend/src/api/service.ts` → `backend/app/api/routes/agents.py` → `backend/app/services/agent_gateway.py` |
| Agent 错误日志 | `backend/logs/agent_errors.log` |
| 测试 | `backend/tests/` + `frontend/src/**/__tests__/` + `run_tests.py` |
