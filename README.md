# StuAutorLite — AI 科研体验平台

面向中小学生的 AI 辅助科研体验平台。通过多智能体引导、算法实验沙盒、可视化训练过程和自动反馈机制，帮助学生体验"提出问题 → 形成假设 → 设计实验 → 运行实验 → 分析结果 → 反思改进 → 生成报告 → 获得反馈"的科研全流程。

## 快速启动

```bash
# 1. 后端 (Python 3.12 + FastAPI)
# ⚠️ 必须在 backend/ 目录下执行，并使用 backend/.venv 虚拟环境
cd backend
.venv/Scripts/activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# MNIST 实验需要 PyTorch（可选，纯分类实验不需要）
pip install torch torchvision numpy psutil

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. 前端 (Node.js + React 18 + Vite)
cd frontend
npm install
npm run dev

# 3. 运行测试
cd .. && python run_tests.py
```

前端 http://localhost:5173 | API 文档 http://localhost:8000/docs

> 后端启动后会自动在后台线程中串行训练 MiniCNN/StandardCNN/DeepCNN 三个预训练模型（首次约需 5-15 分钟/模型），供 MNIST 上传识别使用。通过 `/api/mnist/model-status` 可查询训练进度。
>
> 局域网其他设备通过 `http://<本机IP>:5173` 访问；前端已配置 `host: "0.0.0.0"`。

## 实验任务

| 实验 | 算法/策略 | 路由 | 特点 |
|------|----------|------|------|
| 🧭 迷宫寻路 | BFS / DFS / A\* / Dijkstra / 贪心 / 双向BFS / IDDFS / RandomWalk (8个) | `/workbench/:id` | Canvas 搜索动画 + 迷宫编辑 |
| 🖼️ 图像分类 | KNN / 决策树 / 随机基线 (3个) | `/workbench-classify/:id` | 决策边界动画 + blobs/circles/moons 数据 |
| 🎯 猜数字 | 二分查找 / 随机 / 线性扫描 (3个) | `/workbench-guess/:id` | 步进式猜测动画 |
| 📈 排序算法 | 冒泡/选择/归并/快排 (4个) | `/workbench-sort/:id` | Canvas 柱状动画 + 侧栏折叠 |
| 🔍 字符串搜索 | 暴力/KMP/Boyer-Moore/Rabin-Karp (4个) | 合并于排序实验 | 文本+模式串滑动对比动画 |
| 👁️ 图像识别 | 模板匹配/像素KNN/特征/决策树/MLP/CNN/随机 (7个) | `/workbench-imagerecog/:id` | 双模式：形状+MNIST CNN，SSE 流式训练 |
| 🧠 MNIST CNN | MiniCNN/StandardCNN/DeepCNN/MLP (4架构) | `/workbench-mnist/:id` | PyTorch 训练 + 上传识别 + 预训练模型 |
| 🤖 强化学习 | Q-learning / SARSA (2个) | `/workbench-rl/:id` | 格子世界机器人找金币 + Canvas 路径动画 |

所有实验共享 5-9 阶段研究流程（问题→假设→设计→运行→分析→反思→报告→审稿），配有 AI Agent 引导。

## MNIST 手写数字识别

- **4 种网络架构**：MiniCNN (32K) / StandardCNN (422K) / DeepCNN (871K) / MLP (536K)
- **超参数可调**：学习率、批次大小、训练轮数、优化器(SGD/Adam/RMSprop)、Momentum、Dropout
- **设备自动检测**：系统层探针 (nvidia-smi/npu-smi/dev/davinci) + PyTorch 层匹配，CUDA > MPS > NPU > CPU
- **SSE 流式训练**：epoch 级实时推送 loss/accuracy 曲线、设备使用率
- **上传图片识别**：下拉选择模型（3 个预训练 + 1 个用户训练），上传手写数字图片进行识别

## 强化学习格子世界

- **2 种 RL 算法**：Q-learning (off-policy) / SARSA (on-policy)
- **可调参数**：地图大小 (6-10)、陷阱数量 (1-5)、训练局数 (200-1000)、学习率 α、折扣因子 γ、探索率 ε
- **可视化**：Canvas 网格动画，机器人路径步进播放
- **对比实验**：同地图公平对比算法性能

## AI Agent

6 个内置 Agent，LLM 优先调用 → 失败降级模板。支持 OpenAI / Anthropic / DeepSeek / 硅基流动。

- Research Mentor — 引导提出研究问题
- Experiment Designer — 检查实验公平性
- Data Analyst — 分析实验结果
- Algorithm Tutor — 解释算法原理
- Reflection — 引导反思局限
- Reviewer — 审稿评分

> Agent 配置默认值：API Base URL `https://api.deepseek.com/anthropic`，模型 `deepseek-v4-flash`。
>
> 所有实验通过首页"发现研究任务"卡片进入，机器人避障实验对应 `/workbench-rl/:id` 路由。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite 5 + Tailwind CSS + Zustand + Recharts |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy + Pydantic |
| 数据库 | SQLite |
| 算法(纯Python) | 迷宫搜索、排序、字符串搜索、分类器(blobs/circles/moons 2D数据) |
| 算法(MNIST) | PyTorch 2.x + torchvision + torch_npu(可选) |
| 测试 | pytest + vitest + @testing-library/react |

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── api/routes/        # REST API (14 个路由模块)
│   │   ├── core/
│   │   │   ├── algorithms/    # 迷宫搜索算法 (8 个)
│   │   │   ├── classification/ # 分类器 + 2D 数据生成
│   │   │   ├── guessnumber/   # 猜数字策略
│   │   │   ├── sorting/       # 排序算法
│   │   │   ├── stringsearch/  # 字符串搜索算法
│   │   │   ├── shaperecog/    # 图形识别算法 (7 个)
│   │   │   ├── imagerecog/    # 统一图像识别 Runner
│   │   │   ├── mnist/         # PyTorch CNN 训练 + 模型管理
│   │   │   ├── rl/             # 强化学习格子世界 (GridWorld + Q-learning + SARSA)
│   │   │   └── digits/        # 经典数字模板数据生成器
│   │   ├── agents/            # 6 AI Agent
│   │   ├── models/            # 数据库 ORM + Pydantic Schema
│   │   └── services/          # AgentGateway / ReportGenerator
│   ├── data/
│   │   └── models/            # 预训练模型缓存 (.pth)
│   ├── logs/                  # agent_errors.log + mnist_errors.log
│   └── tests/                 # pytest
├── frontend/
│   └── src/
│       ├── pages/             # 10 个核心页面
│       ├── components/        # 共享组件
│       └── stores/            # 8 个 Zustand Store
└── run_tests.py               # 一键测试运行器
```

## License

MIT
