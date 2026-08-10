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

# MNIST 实验需要 PyTorch（可选，其余 7 类实验为纯 Python 算法，无需 torch）
# 国产化 ARM（鲲鹏/飞腾）无 PyPI wheel 时，可只装纯 Python 依赖跑非 MNIST 实验
# pip install torch torchvision numpy psutil
pip install torch==2.4.0 torch_npu==2.4.0.post2 torchvision==0.19.0 numpy psutil

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. 前端 (Node.js + React 18 + Vite)
cd frontend
npm install
npm run dev

# 3. 运行测试
cd .. && python run_tests.py
# 后端测试默认跳过 slow 类（真实训练/网络下载，避免长时间占用资源）；
# 需要完整验证时显式运行：cd backend && python -m pytest --runslow
# 全局有 pytest-timeout（120s/用例），防死循环/挂起
```

前端 http://localhost:5173 | API 文档 http://localhost:8000/docs

> 后端启动后会自动在后台线程中串行训练 MiniCNN/StandardCNN/DeepCNN 三个预训练模型（首次约需 5-15 分钟/模型），供 MNIST 上传识别使用。通过 `/api/mnist/model-status` 可查询训练进度（训练状态持久化到 `data/models/pretrain_status.json`，进程重启自动恢复）。
>
> 局域网其他设备通过 `http://<本机IP>:5173` 访问；前端已配置 `host: "0.0.0.0"`。

## 安全与部署（课堂/共享环境必读）

应用默认处于**开发态**（零鉴权、CORS 仅本地前端源）。部署到多人/局域网共享环境前，请按需配置以下环境变量（详见 `SECURITY_STABILITY_REVIEW.md` §0.1 修复状态追踪）：

| 配置项 | 作用 | 默认 |
|---|---|---|
| `APP_KEY` | 全站轻量鉴权：设置后所有 `/api` 请求须带 `X-App-Key` 头，否则 401 | 空（不启用） |
| `VITE_APP_KEY` | 前端对应密钥，设置后所有请求自动带 `X-App-Key`（与 `APP_KEY` 一致） | 空 |
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔（如 `https://你的域名`） | `http://localhost:5173,http://127.0.0.1:5173` |

> 除 `CORS_ORIGINS` 外，后端还会自动放行**回环与局域网私有网段**来源
> （`localhost` / `127.0.0.1` / `10.x` / `172.16-31.x` / `192.168.x` 任意端口），
> 以支持「局域网其他设备经 `http://<本机IP>:5173` 访问」——若局域网访问出现
> Network Error，多半是前端来源不在放行范围内，请用 `curl -H "Origin: http://<本机IP>:5173" http://localhost:8000/api/agents/` 验证。
| `RATE_LIMIT_PER_MINUTE` | 每 IP 每分钟最大 API 请求数（防 LLM 端点被刷产生费用）；0=关闭 | `0` |
| `DEBUG` | 生产环境务必设为 `false`，并去掉 `uvicorn --reload` | `true` |

安全要点：
- **不要将服务直接暴露到公网**；如需远程访问请走反向代理（HTTPS）+ 设置 `APP_KEY`
- 前端 Agent API Key 已改为 **sessionStorage** 存储（关闭标签页即清除），不再明文长期落盘；文案已如实说明密钥会发送到后端用于调用模型服务商
- 用户模型以 `weights_only=True` 安全加载，`model_id` 有白名单校验（防路径遍历）

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
- **多卡并行训练**：自动检测空闲 NPU/CUDA 卡 → `nn.DataParallel`，按模型参数量动态限制卡数（MiniCNN=2, StandardCNN=4, DeepCNN=8）
- **SSE 流式训练**：epoch 级实时推送 loss/accuracy 曲线、batch 级进度、设备使用率
- **手写画板识别**：在线画板直接写数字 → 下拉选择模型（3 预训练 + 1 用户训练），开始识别后画板锁定，识别完成可重新编辑
- **训练互斥（MNIST_ACCURACY_FIX）**：用户训练（`/run` 与 `/run-stream` SSE）与后台预训练共用进程级互斥锁，杜绝 torch CPU 并发数据竞争（此前会导致准确率卡 ~10%）；改 lr/batch_size 等超参现已真实生效（前端 camelCase 与后端 snake_case 兼容）
- **预训练幂等**：后台预训练已在运行时不会重复启动

## 强化学习格子世界

- **2 种 RL 算法**：Q-learning (off-policy) / SARSA (on-policy)，ε-greedy 探索 + ε-退火
- **可调参数**：地图大小 (6-10)、陷阱数量 (1-5)、训练局数 (500-2000)、学习率 α、折扣因子 γ、探索率 ε
- **可视化**：Canvas 草地机器人找金币动画，栅栏/深坑/金币/🤖 emoji 图标，路径步进播放
- **轨迹对比**：评估模式 (ε=0) 下两 Agent 同起点出发，在同一格子上叠加绘制路径（Q-learning 蓝色实线 vs SARSA 绿色虚线）
- **策略演变**：训练中保存 Q 表快照，热力图 + 箭头时间轴展示策略从探索到收敛的完整演变过程

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

**反思与改进（每实验专属）**：9 个实验（含排序/字符串、图形/数字子模式共 11 套）各生成 4 道实验强相关 + 1 道通用反思问题，模板按科研能力 2.0/3.5/5.0 分层、填空 ≤2，进入页面默认不选模板。顶栏 🪙 徽章可查看累计 Token 使用量（总/输入/输出、调用次数、模型）。

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
│   ├── logs/                  # app.log, mnist_errors.log, rl_errors.log, agent_errors.log
│   └── tests/                 # pytest (含 test_rl.py 15 用例)
├── frontend/
│   └── src/
│       ├── pages/             # 10 个核心页面
│       ├── components/        # 15 个共享组件（含 MNISTDrawCanvas, PolicyEvolution）
│       ├── stores/            # 9 个 Zustand Store
│       └── utils/             # 工具函数 (format + markdown 渲染)
└── run_tests.py               # 一键测试运行器
```

## 国产化部署

面向鲲鹏/飞腾（ARM64）、海光/兆芯（x86_64）、麒麟 V10 / 统信 UOS / openEuler 等国产环境，**已具备昇腾 NPU 支持**（torch_npu 延迟导入 + npu-smi 探测，设备优先级 CUDA > MPS > NPU > CPU）。除 MNIST 外的 7 类实验为纯 Python 算法，**无 torch 也能完整运行**（MNIST 自动降级提示）。

### 常见问题与建议

| 问题 | 影响 | 建议 |
|------|------|------|
| `requirements.txt` 将 torch/torchvision 列为必装 | ARM 平台无 PyPI wheel 时 `pip install` 失败，连纯算法实验都起不来 | 拆出可选 `requirements-mnist.txt`；主依赖固定 `numpy>=1.24,<2.0`；用华为云/清华 PyPI 镜像 |
| SQLite 与 MNIST 数据用相对路径 `./data` | 从不同 cwd 启动时数据落在错误位置 | 改用 `Path(__file__)` 绝对路径；systemd 固定 WorkingDirectory |
| `docker-compose.yml` 缺少 Dockerfile | `docker compose up` 失败 | 补 multi-arch Dockerfile（`--platform linux/arm64,linux/amd64`）+ 国内镜像源 |
| Python 需 3.12 / Node 需 18+ | 国产 OS 默认版本偏低 | 用 `python:3.12` 容器；Node 从 npmmirror.com 安装 |
| `config.py` 默认 LLM 指向 openai.com | 无代理访问不了 | 改用 DeepSeek / 硅基流动 / 本地 vLLM（前端默认已是 DeepSeek） |
| Canvas emoji（🤖 等）依赖彩色 emoji 字体 | 国产 OS 可能显示为方块 | 装 `fonts-noto-color-emoji`，或关键图标改 SVG |

详细部署清单见 `work.md §十二`。国内源速查：PyPI 清华/华为云镜像、npm `registry.npmmirror.com`、Docker 华为云 SWR。

## License

MIT
