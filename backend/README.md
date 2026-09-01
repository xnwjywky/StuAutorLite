# StuAutorLite Backend

基于 FastAPI 的科研教学后端服务。

## 目录结构

```
backend/
├── app/
│   ├── api/routes/     # API 路由层
│   ├── core/           # 核心业务逻辑（迷宫、算法、实验运行）
│   ├── agents/         # 多智能体实现
│   ├── models/         # 数据模型
│   ├── services/       # 服务编排
│   ├── utils/          # 工具函数
│   ├── config.py       # 应用配置
│   └── main.py         # FastAPI 入口
├── tests/              # 单元测试
├── data/               # SQLite 数据库文件 + MNIST 数据/模型
├── requirements.txt    # Python 依赖（纯 Python，必装）
└── requirements-mnist.txt  # 可选 MNIST 深度学习依赖（PyTorch）
```

## 启动

```bash
cd backend
pip install -r requirements.txt
# 需要 MNIST 深度学习功能时再安装（纯算法机房可跳过）：
# pip install -r requirements-mnist.txt
uvicorn app.main:app --reload --port 8000
```

> 数据/模型/日志路径已锚定到 backend/ 目录（`backend/data`、`backend/logs`），
> 从任意目录启动 uvicorn / pytest 都能定位到同一份数据。

API 文档自动生成于 http://localhost:8000/docs
