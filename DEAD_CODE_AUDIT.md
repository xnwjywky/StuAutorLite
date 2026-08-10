# 无用代码与可清理内容审计报告

> 审计日期：2026-08-10  
> 审计范围：`student-autoresearch-lite` 全项目（backend + frontend）  
> 方法：全量文件扫描 + 交叉引用 grep + git 跟踪文件核查 + 依赖使用率验证  
> 原则：仅标记，不改源码；按影响范围分级，可逐项独立清理

---

## 0. 实施记录（2026-08-10：已按本报告清理完毕）

✅ **P0 — Git 跟踪大文件（仓库膨胀）**：
- `git rm -r --cached backend/data/MNIST/`（8 个文件，~55MB）与 `git rm --cached backend/data/models/{deepcnn,minicnn,standardcnn}.pth`（~3MB）；磁盘文件保留（运行时自动下载/生成）。
- `.gitignore` 追加 `backend/data/MNIST/` 与 `backend/data/models/*.pth`。

✅ **P1 — 死代码（零引用）**：
- 前端：删除死组件 3 个（`PagePlaceholder`/`MarkdownEditor`/`PolicyEvolution`）、死 store 3 个（`sessionStore`/`experimentStore`/`reportStore`，无对应测试文件）、死 hook 1 个（`useApi`）、死工具 `format.ts` + `format.test.ts`（生产 0 引用）。
- 后端：删除 `WorkflowOrchestrator` 死类（保留 `STAGES`/`STAGE_LABELS`）、`ReportGenerator.export_pdf()` 死方法、3 个 `_diag_*.py` 诊断脚本。

✅ **P2 — 低影响清理**：
- `schemas.py`：删除 11 个死 Response 类 + 2 个被路由本地类遮蔽的重复定义（`DigitsRunRequest`/`ImageRecogRunRequest`）；保留活跃的 Request/Create 类与 `SessionResponse`。
- 清理 14 处未使用导入（12 个文件：analysis/sessions/questions/model_manager/experiment_runner/rl/digits/sorting/stringsearch/logger/conftest）。
- 前端删除死 CSS 类 `.scrollbar-hide`。

> 配套验证：后端 `pytest` 231 passed + 14 skipped；前端 `tsc --noEmit` 通过、`vitest` 15 files / 113 tests 全部通过；`import` 冒烟无回归。
> 未清理（确认活跃）：全部路由/Agent/页面/组件/store、`run_tests.py`、依赖包——见 §七。

---

## 影响分级说明

| 级别 | 含义 | 建议 |
|------|------|------|
| 🔴 P0 高影响 | 占用大量仓库体积 / 可能干扰运行 | 优先处理 |
| 🟡 P1 中影响 | 死代码增加维护负担、可能误导开发者 | 建议处理 |
| 🟢 P2 低影响 | 无功能影响，纯整洁度 | 可选清理 |

---

## 一、🔴 P0 — Git 跟踪的大文件（仓库膨胀）

### 1.1 MNIST 数据集被提交进 Git（~55MB）

`.gitignore` 已忽略 `*.db`/`*.log` 等，但**未忽略 `backend/data/MNIST/`**，导致以下 8 个文件被 git 跟踪：

| 文件 | 大小 | 说明 |
|------|------|------|
| `backend/data/MNIST/raw/train-images-idx3-ubyte` | 47,040,016 B | 训练集图像 |
| `backend/data/MNIST/raw/train-images-idx3-ubyte.gz` | 9,912,422 B | 同上压缩版 |
| `backend/data/MNIST/raw/train-labels-idx1-ubyte` | 60,008 B | 训练集标签 |
| `backend/data/MNIST/raw/train-labels-idx1-ubyte.gz` | 28,842 B | 同上压缩版 |
| `backend/data/MNIST/raw/t10k-images-idx3-ubyte` | 7,840,016 B | 测试集图像 |
| `backend/data/MNIST/raw/t10k-images-idx3-ubyte.gz` | 1,648,877 B | 同上压缩版 |
| `backend/data/MNIST/raw/t10k-labels-idx1-ubyte` | 10,008 B | 测试集标签 |
| `backend/data/MNIST/raw/t10k-labels-idx1-ubyte.gz` | 4,542 B | 同上压缩版 |

**影响**：仓库 clone 体积膨胀 ~55MB；这些文件应由 `torchvision.datasets.MNIST(download=True)` 在首次运行时自动下载，不应入库。

**清理方式**：
```bash
git rm -r --cached backend/data/MNIST/
# 然后在 .gitignore 添加：
# backend/data/MNIST/
```

### 1.2 预训练模型权重被提交进 Git（~3MB+）

| 文件 | 说明 |
|------|------|
| `backend/data/models/deepcnn.pth` | DeepCNN 预训练权重 |
| `backend/data/models/minicnn.pth` | MiniCNN 预训练权重 |
| `backend/data/models/standardcnn.pth` | StandardCNN 预训练权重 |

**影响**：模型权重应由 `start_pretrain` 端点运行时生成（代码已有此能力），不应入库。`.gitignore` 未覆盖 `backend/data/models/*.pth`。

**清理方式**：
```bash
git rm --cached backend/data/models/*.pth
# 在 .gitignore 添加：
# backend/data/models/*.pth
```

> ⚠️ 注意：`user_99999.pth`、`user_99999.arch.json`、`pretrain_status.json` 未被 git 跟踪（已在工作区但不影响仓库），无需处理。

---

## 二、🟡 P1 — 死代码（零引用，增加维护负担）

### 2.1 前端死组件（3 个，0 引用）

| 文件 | 导出符号 | 引用数 | 说明 |
|------|----------|--------|------|
| `frontend/src/components/PagePlaceholder.tsx` | `PagePlaceholder` | 0 | 占位页组件，从未被任何路由/页面导入 |
| `frontend/src/components/MarkdownEditor.tsx` | `MarkdownEditor` | 0 | Markdown 编辑器组件，从未被导入 |
| `frontend/src/components/PolicyEvolution.tsx` | `PolicyEvolution` | 0 | 策略演化可视化，从未被导入 |

**清理方式**：直接删除 3 个文件。无任何导入会报错。

### 2.2 前端死 Store（3 个，0 引用）

| 文件 | 导出符号 | 引用数 | 说明 |
|------|----------|--------|------|
| `frontend/src/stores/sessionStore.ts` | `useSessionStore` | 0 | 会话状态管理，功能已由 `workflowStore` 的 `useSessionId` 覆盖 |
| `frontend/src/stores/experimentStore.ts` | `useExperimentStore` | 0 | 实验状态管理，从未被任何页面导入 |
| `frontend/src/stores/reportStore.ts` | `useReportStore` | 0 | 报告状态管理，报告功能已由各 Workbench store 的 `reportMarkdown` 字段覆盖 |

**清理方式**：删除 3 个文件。同时删除对应的 `__tests__/` 测试文件（3 个），避免测试引用已删 store 导致失败。

### 2.3 前端死 Hook（1 个，0 引用）

| 文件 | 导出符号 | 引用数 | 说明 |
|------|----------|--------|------|
| `frontend/src/hooks/useApi.ts` | `useApi` | 0 | 通用 API 调用 hook，从未被导入（各页面直接用 `api/client.ts`） |

**清理方式**：直接删除。

### 2.4 前端死工具函数（`format.ts` 全部，仅测试引用）

| 文件 | 导出函数 | 生产引用 | 测试引用 | 说明 |
|------|----------|----------|----------|------|
| `frontend/src/utils/format.ts` | `formatRuntime` | 0 | 1 | 格式化运行时间 |
| `frontend/src/utils/format.ts` | `formatPercent` | 0 | 1 | 格式化百分比 |
| `frontend/src/utils/format.ts` | `formatDate` | 0 | 1 | 格式化日期 |

**影响**：整个 `format.ts` 文件在生产代码中零引用，仅有 `__tests__/format.test.ts` 测试它。属于"测试测了没人用的代码"。

**清理方式**：删除 `format.ts` 及 `__tests__/format.test.ts`。如果未来需要格式化函数，可按需重建。

### 2.5 后端死类与死方法

| 文件 | 符号 | 行号 | 说明 |
|------|------|------|------|
| `backend/app/services/workflow.py` | `class WorkflowOrchestrator` | 16 | 整个类零引用；同文件的 `STAGES`/`STAGE_LABELS` 仍活跃（被 `sessions.py` 导入） |
| `backend/app/services/workflow.py` | `WorkflowOrchestrator.next_stage()` | 20 | 死方法 |
| `backend/app/services/workflow.py` | `WorkflowOrchestrator.prev_stage()` | 28 | 死方法 |
| `backend/app/services/workflow.py` | `WorkflowOrchestrator.get_all_stages()` | 36 | 死方法 |
| `backend/app/services/report_generator.py` | `ReportGenerator.export_pdf()` | 47 | 死方法（PDF 导出从未被调用）；同文件 `generate()` 仍活跃 |

**清理方式**：删除 `WorkflowOrchestrator` 类（保留 `STAGES`/`STAGE_LABELS`）；删除 `export_pdf()` 方法。

### 2.6 后端诊断脚本（3 个孤立文件，未 git 跟踪）

| 文件 | 大小 | 说明 |
|------|------|------|
| `backend/_diag_mnist.py` | 1,885 B | MNIST 训练诊断脚本（排查准确率时创建） |
| `backend/_diag_runner.py` | 1,484 B | runner.run_stream 复现脚本 |
| `backend/_diag_all_arch.py` | 1,125 B | 四架构对比脚本 |

**影响**：未被 git 跟踪（不影响仓库），但留在工作区会干扰文件浏览，且文件名 `_diag` 前缀可能被误认为是项目代码。

**清理方式**：直接删除 3 个文件。

---

## 三、🟢 P2 — 低影响清理（无功能影响）

### 3.1 后端死 Pydantic Schema 类（11 个）

`backend/app/models/schemas.py` 中以下 Response 类从未被任何路由的 `response_model=` 引用，也未被任何文件导入：

| 行号 | 类名 | 说明 |
|------|------|------|
| 43 | `QuestionSuggestResponse` | 0 引用 |
| 47 | `QuestionResponse` | 仅在 `questions.py` 导入但未使用 |
| 66 | `HypothesisResponse` | 0 引用 |
| 86 | `ExperimentDesignReviewResponse` | 0 引用 |
| 100 | `ExperimentSummaryResponse` | 0 引用 |
| 119 | `AnalysisResponse` | 0 引用 |
| 136 | `ReportResponse` | 0 引用 |
| 152 | `ReviewScoresResponse` | 仅被死代码 `ReviewResponse` 内部引用 |
| 161 | `ReviewResponse` | 0 引用 |
| 178 | `ReflectionQuestionResponse` | 0 引用 |
| 196 | `AgentInvokeResponse` | 0 引用 |

> 唯一活跃的 Response 类是 `SessionResponse`（`sessions.py:19` 使用）。

**清理方式**：删除上述 11 个类，保留 `SessionResponse` 及所有 `*Request` 类（部分仍活跃）。

### 3.2 后端被遮蔽的重复定义（2 个）

`schemas.py` 中定义了以下类，但对应路由文件中定义了同名本地类并使用本地版本，导致 `schemas.py` 中的版本从未被导入：

| 文件 | 行号 | 类名 | 遮蔽位置 |
|------|------|------|----------|
| `schemas.py` | 209 | `DigitsRunRequest` | 被 `digits.py:13` 同名类遮蔽 |
| `schemas.py` | 216 | `ImageRecogRunRequest` | 被 `imagerecog.py:14` 同名类遮蔽 |

**清理方式**：删除 `schemas.py` 中的这两个重复定义。

### 3.3 后端未使用导入（14 处，12 个文件）

| 文件 | 未使用符号 | 导入行 |
|------|-----------|--------|
| `app/api/routes/analysis.py` | `HTTPException` | 4 |
| `app/api/routes/analysis.py` | `Hypothesis` | 6 |
| `app/api/routes/sessions.py` | `json` | 3 |
| `app/api/routes/questions.py` | `HTTPException` | 4 |
| `app/api/routes/questions.py` | `QuestionResponse` | 7 |
| `app/core/mnist/model_manager.py` | `PRESET_ARCHITECTURES` | 19 |
| `app/core/experiment_runner.py` | `compute_metrics` | 12 |
| `app/core/rl/runner.py` | `copy` | 5 |
| `app/core/digits/digits.py` | `math` | 2 |
| `app/core/sorting/algorithms.py` | `random` | 5 |
| `app/core/stringsearch/algorithms.py` | `time` | 5 |
| `app/utils/logger.py` | `os` | 4 |
| `backend/conftest.py` | `Base` | 9 |
| `backend/conftest.py` | `engine` | 9 |

**清理方式**：逐文件删除对应导入行。无功能影响。

### 3.4 前端死 CSS 类

| 文件 | 类名 | 引用数 |
|------|------|--------|
| `frontend/src/index.css` | `.scrollbar-hide` | 0 |

> `.btn-primary`、`.btn-secondary`、`.card` 均活跃。

**清理方式**：删除 `.scrollbar-hide` 规则块。

### 3.5 前端死类型定义（`types/index.ts`，约 22 个）

`frontend/src/types/index.ts` 中以下类型从未被任何文件直接 `import`，仅作为其他类型的子字段被结构性地间接引用：

`ExperimentRun`、`ExperimentParams`、`ExperimentResult`、`VisualizationData`、`AlgorithmStats`、`ReviewScores`、`StudentProfile`、`ApiResponse<T>`、`ClassifierStats`、`ClassificationRun`、`GuessRun`、`SortingStep`、`SortingRun`、`StringSearchStep`、`StringSearchRun`、`ShapeRecogRun`、`DigitRecogRun`、`ImageRecogExperimentType`（且被 `imageRecogStore.ts` 同名类型覆盖）、`ImageRecogVisualizerStep`、`ImageRecogRun`、`MNISTResult`、`MNISTRunRecord`

**影响**：TypeScript 编译不受影响（结构型类型系统）。但约 40% 的类型文件内容从未被显式使用。

**清理方式**：可选——如果追求代码整洁度，可移除未被直接导入且不被任何活跃类型字段引用的类型。需逐个确认是否有间接引用后再删。

### 3.6 磁盘缓存（非 Git 跟踪，占磁盘但不影响仓库）

| 项目 | 数量/大小 | 说明 |
|------|-----------|------|
| `__pycache__/` 目录 | 413 个 | Python 字节码缓存，已 gitignored |
| `.pytest_cache/` | 1 个 | 测试缓存，已 gitignored |
| `backend/logs/*.log` | 4 个文件 | 运行日志，已 gitignored |

**清理方式**：
```bash
find backend -type d -name __pycache__ -exec rm -rf {} +
rm -rf backend/.pytest_cache
# 日志可选清理（运行期会重新生成）
```

### 3.7 根目录 `run_tests.py`（活跃但孤立）

| 文件 | 大小 | 说明 |
|------|------|------|
| `run_tests.py` | 5,552 B | 全量测试运行入口脚本，无 Python 文件 import 它 |

**状态**：作为命令行入口脚本（`python run_tests.py`）可能仍被开发者手动使用。**建议保留**，可在文件头部加注释说明用途。

---

## 四、依赖审查（无多余依赖）

### 后端 `requirements.txt`（11 个包，全部活跃）

| 包名 | 使用位置 | 状态 |
|------|----------|------|
| fastapi | main.py, 所有路由 | ✅ 活跃 |
| uvicorn | main.py | ✅ 活跃 |
| pydantic | schemas.py | ✅ 活跃 |
| pydantic-settings | config.py | ✅ 活跃 |
| sqlalchemy | database.py | ✅ 活跃 |
| httpx | llm_client.py | ✅ 活跃 |
| jsonschema | agent_gateway.py | ✅ 活跃 |
| torch | core/mnist/ | ✅ 活跃 |
| torchvision | core/mnist/ | ✅ 活跃 |
| numpy | core/mnist/, classification/ | ✅ 活跃 |
| python-multipart | mnist.py (UploadFile) | ✅ 活跃 |

### 前端 `package.json`（6 个依赖，全部活跃）

| 包名 | 使用位置 | 状态 |
|------|----------|------|
| axios | api/client.ts | ✅ 活跃 |
| react | 35 处引用 | ✅ 活跃 |
| react-dom | main.tsx (`react-dom/client`) | ✅ 活跃 |
| react-router-dom | 23 处引用 | ✅ 活跃 |
| recharts | ChartPanel, TrainingCurve | ✅ 活跃 |
| zustand | 13 处引用 | ✅ 活跃 |

> devDependencies 全部为构建/测试工具链，无多余。

---

## 五、`.gitignore` 缺口汇总

当前 `.gitignore` 已覆盖 `.db`/`.log`/`.env`/`__pycache__`/`node_modules`/`dist` 等，但**遗漏以下两项**：

| 缺失规则 | 导致后果 | 建议添加 |
|----------|----------|----------|
| `backend/data/MNIST/` | 55MB 数据集被 git 跟踪 | 添加该行 |
| `backend/data/models/*.pth` | 模型权重被 git 跟踪 | 添加该行 |

---

## 六、清理优先级与影响评估

### 第一批（P0，立即可做，效果最显著）

| 操作 | 影响 | 风险 | 预计节省 |
|------|------|------|----------|
| `git rm -r --cached backend/data/MNIST/` + .gitignore | 仓库体积减少 ~55MB | 无（运行时自动下载） | ~55MB |
| `git rm --cached backend/data/models/*.pth` + .gitignore | 仓库体积减少 ~3MB | 无（运行时自动生成） | ~3MB |
| 删除 `backend/_diag_*.py`（3 个） | 工作区整洁 | 无（诊断已完成） | — |

### 第二批（P1，建议处理，减少维护负担）

| 操作 | 影响 | 风险 |
|------|------|------|
| 删除前端死组件 3 个 | 减少 3 个无人维护的文件 | 无（0 引用） |
| 删除前端死 store 3 个 + 对应测试 3 个 | 减少 6 个无人维护的文件 | 无（0 引用） |
| 删除前端死 hook 1 个 | — | 无（0 引用） |
| 删除前端 `format.ts` + 测试 | 减少 2 个文件 | 无（仅测试引用） |
| 删除后端 `WorkflowOrchestrator` 类 | 减少 1 个死类 + 3 个死方法 | 无（保留 STAGES/STAGE_LABELS） |
| 删除后端 `export_pdf()` 方法 | — | 无（0 引用） |

### 第三批（P2，可选，纯整洁度）

| 操作 | 影响 | 风险 |
|------|------|------|
| 删除 11 个死 schema 类 | schemas.py 减少约 60% | 低（需确认无间接引用） |
| 删除 2 个被遮蔽的重复定义 | 消除歧义 | 无 |
| 清理 14 处未使用导入 | 代码整洁 | 无 |
| 删除死 CSS 类 `.scrollbar-hide` | — | 无 |
| 清理死类型定义 | types/index.ts 减少 ~40% | 低（需逐个确认） |
| 清理 `__pycache__`/`.pytest_cache` | 释放磁盘 | 无（自动重建） |

---

## 七、不建议清理的内容（确认活跃）

以下内容经核查确认活跃，**不应清理**：

- **全部 16 个路由模块**：均通过 `main.py` 的 `include_router` 注册
- **全部 6 个 Agent 类**：通过 `agent_gateway.py` 延迟导入实例化
- **全部 21 个前端页面**：均在 `App.tsx` 路由中引用
- **16/19 个前端组件**：活跃（仅 3 个死组件可删）
- **10/13 个前端 store**：活跃（仅 3 个死 store 可删）
- **`run_tests.py`**：命令行入口脚本，建议保留
- **`backend/data/stuautor.db`** 等：已被 .gitignore 正确忽略
- **全部后端/前端依赖包**：无多余依赖
