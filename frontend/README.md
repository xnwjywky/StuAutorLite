# StuAutorLite Frontend

基于 React + TypeScript + Vite 的科研体验平台前端。

## 技术栈

- **框架**：React 18 + TypeScript
- **构建**：Vite 5
- **样式**：Tailwind CSS 3
- **状态管理**：Zustand
- **路由**：React Router 6
- **图表**：Recharts
- **HTTP**：Axios

## 目录结构

```
frontend/
├── public/              # 静态资源
├── src/
│   ├── pages/           # 页面组件
│   ├── components/      # 可复用 UI 组件
│   ├── stores/          # Zustand 状态管理
│   ├── api/             # API 调用封装
│   ├── hooks/           # 自定义 Hooks
│   ├── types/           # TypeScript 类型定义
│   └── utils/           # 工具函数
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── .env
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

开发服务器运行在 http://localhost:5173，API 请求自动代理到后端 http://localhost:8000。
