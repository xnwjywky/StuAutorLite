# 全局背景底色 → 米白色 执行方案

> 生成时间：2026-08-11 ｜ 范围：`student-autoresearch-lite/frontend`
> 目标：将全站页面背景底色从 `gray-50`（浅灰 `#F9FAFB`）改为**米白色**，同时不破坏按钮/卡片 hover 等交互态视觉。
>
> **✅ 已落地（2026-08-11）**：实际采用色值 **`#f5ecd0`**，仅替换纯白/浅灰背景底色（12 处），其他组件未改动。tsc 0 错误、vitest 113 passed。

---

## 一、背景现状分析

### 1.1 页面底色来源（真正的"背景色"）

全站背景色实际上由**两级 4 个位置**决定，均使用 Tailwind `bg-gray-50`（`#F9FAFB`）：

| # | 位置 | 当前代码 | 作用 |
|---|------|----------|------|
| 1 | `frontend/index.html:10` | `<body class="min-h-screen bg-gray-50 text-gray-900">` | 首屏兜底底色 |
| 2 | `frontend/src/index.css:6-8` | `@layer base { body { @apply antialiased text-gray-900 bg-gray-50; } }` | 全局 body 底色 |
| 3 | `frontend/src/components/Layout.tsx:24` | `<div className="min-h-screen bg-gray-50">` | 主布局（含导航栏）包层 |
| 4 | 9 个 Workbench 内容区 | `<div className="flex-1 overflow-auto bg-gray-50">` | 各实验工作台内容区 |

> 所有页面（21 个）均渲染在 `<Layout>` 内，**无独立页面自行覆盖背景**，故只需改上述位置即可全局生效。

### 1.2 不能动的 `bg-gray-50`（交互态）

全项目 `bg-gray-50` 共 **89 处**，其中大部分是**交互/内容态**，**不能**纳入全局替换：

| 类型 | 数量 | 示例 |
|------|------|------|
| `hover:bg-gray-50`（悬停反馈） | 43 处 | `hover:bg-gray-50`（按钮/列表项悬停变浅灰） |
| `bg-gray-50/30`、`bg-gray-50/50`（半透明卡片悬停） | 7 处 | AlgorithmCard/ImageRecogWorkbench 卡片 hover |
| 未选中项背景 | 12 处 | `bg-gray-50 text-gray-600`（问题/选项未选中态） |
| 内容块内衬背景 | 27 处 | 维度评分条、Token 弹窗统计块、标签 chip 等 |

> ⚠️ 若直接全局替换 `bg-gray-50 → 米白`，上述交互态会一并变成米白，**悬停反馈将失效**（背景与页面同色看不出变化）。因此必须**按"页面底色"精准替换**。

---

## 二、米白色值选择

米白（cream / off-white）属于暖白系，推荐以下值（按优先级）：

| 色值 | 名称 | 说明 |
|------|------|------|
| **`#F5ECD0`** | ✅ 已采用 · 米白 | 用户指定色值，暖米白/奶油色，柔和护眼 |
| `#FAF9F6` | 备选 · 经典米白 | 苹果系 off-white，更素一档 |
| `#FDFBF7` | 备选 · 暖白 | 更偏黄一档，奶油感更强 |
| `#F8F6F0` | 备选 · 灰米 | 暖中带灰，更"素" |
| `#F5F0E8` | 备选 · 米黄 | 明显米黄调，接近纸张色 |

> 本方案最终采用 **`#F5ECD0`**（用户指定）。如需微调，改 `tailwind.config.js` 中 `paper` 一处即可。

---

## 三、推荐执行方案（方案 A：新增自定义色 + 精准替换）

### 思路
在 `tailwind.config.js` 注册一个自定义色 `paper`（值取米白），只把 **4 处页面底色**从 `bg-gray-50` 改为 `bg-paper`；交互态 `bg-gray-50` 全部保留。日后想换暖白/米黄，改一处色值即可。

### 3.1 步骤一：注册自定义色

**文件**：`frontend/tailwind.config.js`

在 `theme.extend.colors` 中新增：

```js
colors: {
  primary: { /* 现有不变 */ },
  // 新增：米白底色（已采用 #f5ecd0；可选 #FAF9F6 / #FDFBF7 / #F8F6F0 / #F5F0E8）
  paper: "#f5ecd0",
},
```

### 3.2 步骤二：替换 4 处页面底色

| # | 文件:行 | 修改前 | 修改后 |
|---|---------|--------|--------|
| 1 | `index.html:10` | `class="min-h-screen bg-gray-50 text-gray-900"` | `class="min-h-screen bg-paper text-gray-900"` |
| 2 | `src/index.css:7` | `@apply antialiased text-gray-900 bg-gray-50;` | `@apply antialiased text-gray-900 bg-paper;` |
| 3 | `src/components/Layout.tsx:24` | `min-h-screen bg-gray-50` | `min-h-screen bg-paper` |
| 4a | 9 个 Workbench（整行） | `<div className="flex-1 overflow-auto bg-gray-50">` | `<div className="flex-1 overflow-auto bg-paper">` |

**Workbench 完整清单**（9 个，均改为 `bg-paper`）：

| 文件 | 行号 |
|------|------|
| `src/pages/ClassificationWorkbench.tsx` | 139 |
| `src/pages/DigitsWorkbench.tsx` | 104 |
| `src/pages/GuessNumberWorkbench.tsx` | 126 |
| `src/pages/ImageRecogWorkbench.tsx` | 125 |
| `src/pages/MNISTWorkbench.tsx` | 196 |
| `src/pages/RLWorkbench.tsx` | 112 |
| `src/pages/ShapeRecogWorkbench.tsx` | 102 |
| `src/pages/SortingWorkbench.tsx` | 109 |
| `src/pages/Workbench.tsx` | 139 |

### 3.3 步骤三：验证

```bash
cd frontend
npx tailwindcss -i ./src/index.css -o ./dev.css --content "./index.html ./src/**/*.{js,ts,jsx,tsx}"   # 或直接 npm run dev
npm run build        # tsc -b && vite build，确认无类型/构建错误
npm run test         # vitest，确认 113 个测试不受影响（不涉及样式）
```

目测检查项：
- [ ] 首页/各 Workbench 页面底色为米白
- [ ] 白色卡片（`bg-white`）在米白底上轮廓清晰
- [ ] 列表项/按钮 hover 仍是浅灰（`hover:bg-gray-50` 生效）
- [ ] 未选中选项背景、Token 弹窗、维度评分条内衬仍是浅灰
- [ ] 导航栏 `bg-white/90` 与米白页面过渡自然

---

## 四、备选方案（不推荐）

| 方案 | 做法 | 风险 |
|------|------|------|
| **B：全局替换** | `sed 's/bg-gray-50/bg-paper/g'` 一次性替换全部 89 处 | ❌ 43 处 `hover:bg-gray-50` + 7 处半透明 + 12 处未选中态全部失效，按钮悬停"看不见"，交互体验劣化 |
| **C：CSS 变量** | 在 `index.css` 定义 `--color-bg`，body 及 Workbench 用 `style={{ background: 'var(--color-bg)' }}` | ⚠️ 需改 12 处 JSX 为内联样式，且破坏 Tailwind 语义化，不推荐 |
| **D：覆盖 `gray-50` 色值** | 在 tailwind config 把 `gray.50` 直接改米白 | ❌ `gray-50` 还用于 hover/选中态/内衬，全局连带变色，问题同方案 B |

> 结论：**方案 A 侵入最小、语义最清晰、可一键换色**，为本方案推荐。

---

## 五、改动清单汇总

| 文件 | 改动类型 |
|------|----------|
| `frontend/tailwind.config.js` | 新增 `paper: "#FAF9F6"` 自定义色 |
| `frontend/index.html` | body 类 `bg-gray-50` → `bg-paper` |
| `frontend/src/index.css` | base body `bg-gray-50` → `bg-paper` |
| `frontend/src/components/Layout.tsx` | 包层 `bg-gray-50` → `bg-paper` |
| 9 个 `pages/*Workbench.tsx` | 内容区 `bg-gray-50` → `bg-paper` |

**总计 12 个文件**，全部为"1 个 class 值"级替换，无逻辑改动，无新增依赖，可随时回退（git revert）。

---

## 六、后续可选项（本次不做）

- 若希望白色卡片在米白底上更柔和，可将 `.card` 阴影 `shadow-sm` 微调或卡片底色改为 `#FFFFFF` 不变（当前已协调，无需动）。
- 若希望导航栏与背景融为一体，可把 header 的 `bg-white/90` 改为 `bg-paper/90`（可选，非必须）。
- 深色模式（dark mode）未启用，本项目无 `dark:` 变体，无需处理。
