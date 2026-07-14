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
├── data/               # SQLite 数据库文件
└── requirements.txt    # Python 依赖
```

## 启动

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API 文档自动生成于 http://localhost:8000/docs
