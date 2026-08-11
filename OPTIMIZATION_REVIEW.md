# StuAutorLite 项目优化与更新建议汇总

> 审查时间：2026-08-10 ｜ 范围：backend（排除 .venv）、frontend（排除 node_modules/dist）、根目录配置与文档
> 审查方式：全量代码走查，以下每条均基于实际代码定位。
>
> **【二次核验】** 2026-08-10 逐项对照当前代码复核，每条追加 `核验` 标记：
> ✅ 属实建议采纳 ｜ 🟡 属实但低优先/可做可不做 ｜ ⛔ 不必要或误报（不建议改）

---

## 一、高优先级（建议尽快修复）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 1 | `frontend/src/hooks/useBackendHealth.ts:60` | 健康检查用裸 `fetch`，**不带 `X-App-Key` 头**：后端一旦启用 `APP_KEY` 鉴权，探测恒 401，会误判"后端不可达"并弹全局横幅——功能级 bug | 健康检查请求统一走 `client.ts` 或手动附加 `X-App-Key` 头 |
| 2 | `frontend/package.json` | 有 `"lint": "eslint ."` 脚本，但 devDependencies 中**没有 eslint、也无配置文件**——`npm run lint` 必然失败的死脚本 | 补 eslint 依赖与配置，或删除该脚本 |
| 3 | `backend/requirements.txt` | 全部依赖 `>=` 不锁上限（`torch>=2.0`、`numpy>=1.24` 等），README 自己也承认需 `numpy<2.0`；无 lock、未声明 `requires-python`；README §国产化 建议的"拆出 requirements-mnist.txt"至今未做，ARM 环境整体安装仍会失败 | 主依赖改 `~=`/`==` 锁版本；拆出 `requirements-mnist.txt` 可选依赖；补 `requires-python >= 3.12` |
| 4 | `backend/requirements.txt` | pytest 用了 `asyncio_mode=auto` 和 `timeout=120`，但 pytest-asyncio、pytest-timeout **均未列入依赖** | 新增 `requirements-dev.txt` 声明测试依赖 |
| 5 | `backend/conftest.py:9-17` | 测试直接使用生产 `stuautor.db`（同一 engine），`init_db()` 会污染真实开发数据 | 测试用独立 sqlite 文件 + `dependency_overrides` |
| 6 | `backend/app/models/database.py:6` | `DATABASE_URL` 硬编码 `sqlite:///./data/stuautor.db`，完全忽略 `config.py:32` 的 `database_url` 配置项——配置形同虚设；且相对路径在 cwd 不同时数据落错位置（README 已预警） | 改用 `settings.database_url`，并用 `Path(__file__)` 定位绝对路径 |
| 7 | `run_tests.py:60-75, 115-118` | `RESULTS["backend"]` 统计后未赋值恒为 0；`return` 后的日志保存代码不可达（死代码）；`output.count(" passed")` 统计方式不可靠；venv 只认 Windows `.venv/Scripts/python.exe`，无 POSIX `bin/python` 回退 | 用 pytest 退出码 + `-q` 摘要行统计；删除死代码；补跨平台 venv 探测 |

---

## 二、安全

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 8 | `backend/app/config.py:11,16` | `debug=True`、`app_key=""` 为默认值：生产忘配 `.env` 即裸奔 | debug 默认 False；启动时对"空 app_key + 非本机 CORS"组合打印醒目警告 |
| 9 | `backend/app/main.py:57-63` | CORS `allow_origin_regex` 放行整个局域网私有网段任意端口，配合默认零鉴权，同网段任意网页可调用所有 API（含 DELETE） | 该 regex 仅在 debug 模式生效，或收窄端口范围 |
| 10 | `backend/app/main.py:171-177` | `/health` 公开泄露 `sys.executable`、服务器 cwd 绝对路径 | 移除敏感字段或鉴权后返回 |
| 11 | `frontend/src/api/service.ts:199-202` | Agent 错误日志（可能含 LLM 响应/上下文）明文写入 localStorage 长期落盘，与"密钥改 sessionStorage"的加固方向相悖 | 改 sessionStorage 并脱敏 |
| 12 | `frontend/src/api/client.ts:47-58` | 用户 LLM API Key 以 `X-API-Key` 明文头经 HTTP 发往本机后端，无非 localhost 的 http 告警 | `detectBaseUrl` 对非 localhost 的 `http://` 目标给出警告 |
| 13 | `frontend/package.json:16-21` | axios 下限 `^1.7.0`（1.7.4 前有 SSRF CVE-2024-39338）；React 18.3 / react-router 6.23 / zustand 4 均落后一代 | 抬高 axios 下限，接入 `npm audit` / CI；规划 React 19 / Router 7 / zustand 5 升级 |
| ✅ | `frontend/src/utils/markdown.tsx` | 正面确认：未用 `dangerouslySetInnerHTML`，Agent key 已用 sessionStorage，模型加载 `weights_only=True` + 白名单——这些无问题 | 保持 |

---

## 三、代码质量与重复

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 14 | `backend/app/api/routes/agents.py:76-139` | 7 个专用端点逐字复制同一模式，与已有的通用 `/{agent_name}/invoke`（L56）完全重复 | 删除专用端点或抽公共依赖函数 |
| 15 | `backend/app/api/routes/shaperecog.py` / `digits.py` vs `imagerecog.py` | 前两者结构完全雷同，且 imagerecog 已是合并模块；旧路由与 `ShapeRecogRun`/`DigitsRun` 两张表疑似死代码 | 确认前端不再调用后删除旧路由、旧模型和 `core/shaperecog`、`core/digits` |
| 16 | 后端 8+ 处 `_run_to_dict` | experiments.py:128、mnist.py:371、rl.py、guessnumber.py、sorting.py、stringsearch.py 等重复序列化函数 | 下沉到 `app/models/schemas.py` 或公共 helper |
| 17 | `backend/app/core/mnist/runner.py`（1031 行） | 单文件超长，含 **12 处 `except Exception: pass`** 静默吞错，训练问题极难排查 | 拆分模块；至少 `logger.debug(e)` |
| 18 | `backend/app/models/database.py:441-442` | 迁移函数 `_migrate_reflection_task_id` 裸 `except: pass`，ALTER 失败无痕迹 | 记录 warning 日志 |
| 19 | `backend/app/main.py:20-40, 88-104` 与 `mnist.py:16-23` | logger 初始化代码重复三份，未复用已有的 `app/utils/logger.get_logger` | 统一走 `get_logger` |
| 20 | `frontend/src/pages/*.tsx` | MNISTWorkbench.tsx 1067 行、Workbench.tsx 780 行等超长组件；8 个 Workbench 的 STEPS 定义、StageContainer 按钮 JSX 大量逐字重复（如 DigitsWorkbench.tsx:188/236/297 ≈ ClassificationWorkbench.tsx:262/345/439） | 抽 `useWorkbenchScaffold` Hook / 统一 StageNav 组件 |
| 21 | `frontend/src/stores/` | 10 个 store（classification/digits/guessNumber/imageRecog/mnist/rl…）结构高度同构（currentStage/design/result/reset） | 用泛型工厂函数收敛 |
| 22 | `frontend/src/api/service.ts` | 19 处 `as any` / `as Promise<any>`，各 Workbench 另有 10-18 处，strict 模式形同虚设 | axios 拦截器保留 `AxiosResponse` 泛型，补齐类型定义 |
| 23 | `frontend/src/utils/markdown.tsx` | 手写 Markdown 解析器（表格直接塞 `<pre>`、行内只支持 `**`），渲染 LLM 内容，维护成本高 | 换 `react-markdown` 成熟方案 |
| 24 | `frontend/src/api/client.ts:30,40` | 请求拦截器对每个请求 `console.debug`/`console.error` 无环境开关，生产构建全量输出 | 包 `if (import.meta.env.DEV)` |
| 25 | `backend/app/api/routes/reflection.py:163-171` | 启发式评分一串魔法数字（30/80/200 长度阈值、关键词列表硬编码） | 提取为模块级常量配置 |

---

## 四、架构与性能

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 26 | `backend/app/services/agent_gateway.py:191` | `async def invoke` 内同步调用 `agent.respond(context)`，阻塞事件循环；`llm_client.py:50,85` 每次请求新建 `httpx.AsyncClient` 无连接复用 | `respond` 用 `run_in_executor`；client 单例复用 |
| 27 | `backend/app/api/routes/mnist.py:112-138` | 同步 `def` 端点跑完整训练（耗尽 `run_stream` 生成器），一次请求独占线程池 worker 数分钟，并发即耗尽 | 只保留 SSE 端点或改后台任务 |
| 28 | `mnist.py:183` / `imagerecog.py:101` | `asyncio.get_event_loop()` 已弃用 | 改 `get_running_loop()` |
| 29 | 后端全局单例散布 | `get_gateway()`、`ModelManager._instance`、rate_limit `_limiter`、各路由模块级 `runner = XxxRunner()`（import 即实例化）——模块导入副作用 + 全局状态，测试难隔离；`mnist.py:333` 还直接访问 `_training_status` 私有变量 | 改 FastAPI lifespan 注入；ModelManager 加公开查询方法 |
| 30 | 后端 list 端点无分页 | experiments.py:110、sessions.py:15、rl.py:128 等 `.all()` 全量返回，且 `_run_to_dict` 逐行 `json.loads` 大字段 | 加 limit/offset 分页，摘要/详情分离 |
| 31 | `agent_gateway.py:225` / `reflection.py:116` | `import jsonschema` 每次校验时函数内导入；循环内逐题查 session 表（N+1） | 模块级导入；循环外取一次 |
| 32 | `frontend/src/App.tsx:1-54` | 20 个路由页面全部静态 import，无 `React.lazy`；vite.config 无 `manualChunks`，recharts 等大依赖打进首屏 bundle | 路由级懒加载 + 拆分 recharts |
| 33 | `frontend/src/hooks/useBackendHealth.ts:98-109` | `check` 依赖 `[online, failCount, retryKey]`，每次状态变化重建 15s 轮询；且与 TokenUsageBadge.tsx:55 的 15s 轮询并存 | 合并为全局 store 单点探测，稳定轮询节奏 |

---

## 五、错误处理与测试

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 34 | `agent_gateway.py:116-117, 231-232` | 用量落盘失败、jsonschema 校验失败均静默 | 至少 debug 级日志 |
| 35 | `llm_client.py:42-43` | 无 api_key 时返回伪造的 `"{}"` 响应，把配置错误伪装成 LLM 空输出 | 显式抛错或返回带标记的错误结构 |
| 36 | 测试覆盖 | 偏向 core 算法与 API happy path；agents/gateway/llm_client（降级、重试、schema 修复逻辑）无直接测试——最易回归的部分 | 补 `test_gateway.py` 等 |

---

## 六、工程化与文档

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 37 | 全仓库 | 无 Prettier / .editorconfig / CI（无 .github/workflows），风格与测试门禁全靠自觉 | 补 prettier + lint-staged + GitHub Actions 跑 `run_tests.py` |
| 38 | `frontend/vite.config.ts:17` | 代理目标 `127.0.0.1:8000` 硬编码 | 读取环境变量，支持远程后端开发 |
| 39 | `frontend/` 环境变量 | `VITE_API_BASE_URL`/`VITE_APP_KEY` 无 `.env.example`；frontend/.env 注释与 client.ts:8-10 实际行为已不一致 | 补 `.env.example`，同步注释 |
| 40 | `frontend/package.json` | Vite 锁 `^5.2.0` 而 vitest 用 `^4.1.10`，跨代组合易插件不兼容 | 统一升级至 Vite 7 + 对应 vitest（或至少升到 5.x 最新补丁） |
| 41 | `README.md:150-153` | 项目结构描述过时：称 pages 10 个实为 20 个、components 提到的 PolicyEvolution.tsx 已不存在、stores 称 9 个实为 10 个；README:18 把 `torch_npu==2.4.0.post2` 写进通用快速启动，误导非昇腾用户 | 同步 README 与实际结构；torch_npu 移到国产化部署章节 |
| 42 | `.gitignore` | 整体完整，但缺 `*.tsbuildinfo`、`*.local` 等 | 补充 |

---

## 修复路线图建议

**第一批（1-2 天，低风险高收益）**：#1 健康检查鉴权 bug、#2 删除/修复 lint 死脚本、#3/#4 依赖锁定与拆分、#5 测试库隔离、#24 console 开关、#41 README 同步

**第二批（1 周内）**：#6 database_url 配置生效、#7 run_tests.py 重写统计逻辑、#8-#10 安全默认收紧、#17 mnist runner 吞错治理、#28 弃用 API 替换

**第三批（结构性重构，排期进行）**：#14-#16/#20-#21 前后端重复代码收敛、#26-#27 异步与训练端点改造、#29 依赖注入改造、#32 前端懒加载、#36 网关测试补齐

**总体印象**：项目安全基线已有意识（hmac 比较、限流、上传白名单、密钥 sessionStorage），主要技术债集中在：① mnist 模块超长文件 + 静默吞错；② 前后端路由/store/序列化大量复制粘贴；③ 配置与实际行为脱节（database_url、requirements 未锁定、README 过时）；④ 测试依赖与隔离缺失。

---

# 七、二次核验：不必要 / 误报项（不建议改动）

> 以下条目经逐行核对当前代码后判定为**误报**或**不需要改**，若按原建议实施反而引入风险/破坏功能。

| # | 原问题 | 核验结论 | 依据（当前代码位置） |
|---|--------|----------|----------------------|
| 1 | 健康检查不带 X-App-Key 会 401 | ⛔ **误报** | `/api/health`（main.py:151）与 `/health`（main.py:145）是 `@app.get` 直接注册的裸端点，**未挂** `_API_DEPENDENCIES`（仅 main.py:70-85 的 include_router 挂载）。启用 APP_KEY 后健康检查仍放行，不会 401。若按建议附加 `X-App-Key` 头反而无意义（后端不校验该端点） |
| 9 | CORS regex 放行局域网网段 | ⛔ **设计使然，不必改** | main.py:50-63 注释明确写明这是"覆盖 README 支持的局域网其他设备经 `<本机IP>:5173` 访问"的功能需求（源自 LAN_ACCESS_SOLUTION）。`allow_credentials=False` + 可选 `X-App-Key` 鉴权已控制风险。若"仅 debug 生效"会直接破坏局域网访问功能 |
| 11 | Agent 错误日志存 localStorage | ⛔ **不必改** | `service.ts:196-205` 记录的是 `{agent, stage, error, time}` 排障日志，**不含 API Key**；错误日志期望持久留存便于排查，改 sessionStorage 刷新即丢反而不利。与"密钥 sessionStorage"并无冲突（密钥不在其中） |
| 13 | axios/React/Router/zustand 升级 | ⛔ **过度设计，不必改** | CVE-2024-39338 为 SSRF，需攻击者控制 axios 请求 URL——本项目 axios 只请求固定本机后端，攻击面不存在。React 18/zhustand 4 对教育项目完全够用，升级纯引入兼容风险无收益 |
| 15 | shaperecog/digits 疑似死代码可删 | ⛔ **误报，删除会破坏功能** | 前端 `DigitsWorkbench.tsx:211` 仍调用 `runDigitsExperiment`（`/api/digits/run`），`ShapeRecogWorkbench.tsx:217` 仍调用 `runShapeRecogExperiment`（`/api/shaperecog/run`）。imagerecog 是新增合并模块，但旧路由并非死代码，仍被独立页面使用 |
| 21 | 10 个 store 用泛型工厂收敛 | ⛔ **过度设计，不必改** | 各 store 虽结构同构但字段与逻辑各自不同（n_samples/noise_levels/strategy 等差异大），泛型抽象后可读性与可调试性下降，对教学项目收益为负 |
| 23 | 手写 markdown 换 react-markdown | ⛔ **不必改** | 现有手写解析器（markdown.tsx）刻意不用 `dangerouslySetInnerHTML`（本审查 ✅ 已正面确认安全）；换 react-markdown 引入新依赖，且默认渲染会开 HTML 需额外配置转义，安全面反而变宽。当前实现够用且安全 |
| 26 | respond 阻塞事件循环 + httpx 无复用 | ⛔ **过度优化，不必改** | `agent.respond(context)` 是纯本地模板降级（字符串拼接），毫秒级不构成阻塞；httpx 每次新建 client 的开销相对 LLM 网络延迟（秒级）可忽略。改 `run_in_executor` 收益近乎为零 |
| 29 | 全局单例改 lifespan 注入 | ⛔ **架构级重构，不必做** | FastAPI 单进程应用用模块级单例是常见惯用法；后端 230 个测试已全部通过，测试隔离实际可用（conftest 提供独立 session）。改 lifespan 注入是大改动，风险 > 收益 |
| 30 | list 端点加分页 | ⛔ **过度设计，不必改** | 教学场景单 session 实验记录通常几十条以内，`.all()` 全量返回毫秒级。加分页是无需求驱动的复杂度 |
| 32 | 路由级 React.lazy 懒加载 | ⛔ **过度优化，不必改** | 内网教学部署（vite build 后本地/局域网访问），首屏 bundle 大小无感知差异；Vite dev 本身按需编译。拆分 recharts 收益极小 |
| 33 | 双 15s 轮询合并为全局 store | ⛔ **不必改** | useBackendHealth（后端可达性）与 TokenUsageBadge（token 统计）职责独立、各自仅 1 个请求/15s；合并成全局 store 增加状态耦合，收益微小 |
| 35 | llm_client 无 key 伪造 `{}` 响应 | ⛔ **设计取舍，不必改** | 无 key 返回 `{}` 让上层 `agent_gateway._validate_and_repair` 走模板降级链路（agents.py 前端 `hasAgentConfig` 亦先判断有无 key）。改成抛错会破坏"无 key 走模板"的课堂降级体验 |
| 37 | 补 Prettier / CI / GitHub Actions | ⛔ **不必要** | 单人/小团队本地 + 局域网部署形态，无外部协作，CI 门禁是空转成本；README 与部署均面向本地/内网。prettier 纯风格偏好，非功能需求 |
| 40 | Vite 5 + vitest 4 跨代升级 | ⛔ **不必改** | 前端 113 个测试当前全绿（vitest 4 与 vite 5 组合实际可运行）。升级 Vite 7 需连带插件/配置迁移，纯风险无收益 |

---

# 八、二次核验：合理但低优先（可选做）

> 以下条目**属实**，但对当前教育/内网场景影响有限，可排期处理，不必列入近期修复。

| # | 核验结论 | 说明 |
|---|----------|------|
| 2 | 🟡 属实，建议做 | 删掉 `lint` 脚本即可（10 秒），比补 eslint 依赖更省事 |
| 3 | 🟡 属实，建议做 | 至少补 `requires-python` + `numpy<2.0` 约束；拆分 requirements-mnist.txt 可排期 |
| 4 | 🟡 属实，建议做 | 补 `requirements-dev.txt`（pytest-asyncio/pytest-timeout），一次性成本 |
| 5 | 🟡 属实，建议做 | 测试用独立 sqlite 文件，避免污染开发数据；改动小 |
| 6 | ✅ 属实，建议做 | 配置项已存在（config.py:32）只是未接，改 database.py:6 一行即可让配置生效 |
| 7 | ✅ 属实，建议做 | run_tests.py 确有死代码 + 恒 0 统计，重写统计逻辑是明确修复 |
| 8 | 🟡 部分合理 | 启动警告合理；但 debug 默认 False 对本地开发不便，建议保留 True + 生产提示 |
| 10 | 🟡 属实，可做可不做 | 内网泄露 python 路径/cwd 危害极低；删两个字段成本极低 |
| 12 | 🟡 属实，低优先 | 加 http 告警是低成本改进；但项目架构本就前端直连，告警只是提示 |
| 14 | 🟡 属实，低收益 | 7 个端点语义清晰（suggest/review/analyze/reflect/chat），抽公共函数可做可不做 |
| 16 | 🟡 属实，低收益 | 各表字段不同，通用 helper 需带参设计，收益有限 |
| 17 | 🟡 属实，建议做 | 28 处 except 中多数为设备探测兜底，**重点给训练循环内 353/465/489 等加日志**即可，不必整体拆 1031 行 |
| 18 | ✅ 属实，建议做 | 加一行 warning 日志，零成本 |
| 19 | 🟡 属实，低收益 | logger 初始化重复但行为正确，统一走 get_logger 是锦上添花 |
| 20 | 🟡 属实，重构风险大 | 抽 Hook 需同步 8 个 Workbench 回归，收益是行数减少，排期再做 |
| 22 | 🟡 属实，低优先 | as any 不修不影响运行；补类型是工程债，非功能 |
| 24 | ✅ 属实，建议做 | 包 `if (import.meta.env.DEV)` 两处即可 |
| 25 | 🟡 属实，低收益 | 魔法数字提取常量，改善可读性，可顺手做 |
| 27 | 🟡 属实但已有保护 | 前端仅调 `/run-stream`（MNISTWorkbench.tsx:434），同步 `/run` 无调用方；且已加训练互斥锁（409）。可保留作 fallback，不必删 |
| 28 | ✅ 属实，建议做 | `get_event_loop()` → `get_running_loop()`，两处替换，成本极低 |
| 31 | 🟡 属实，低收益 | 函数内 import 在 FastAPI 下无实质开销；N+1 在单 session 数据量下无感 |
| 34 | 🟡 属实，低成本 | 加 debug 日志即可 |
| 36 | 🟡 合理，工作量大 | 补 gateway 测试有价值，可排期 |
| 38 | 🟡 属实，低优先 | 代理硬编码仅影响 dev；已有 VITE_API_BASE_URL 覆盖生产场景 |
| 39 | ✅ 属实，建议做 | frontend/.env 注释已过时（client.ts 现走 Vite 代理同源），补 .env.example + 同步注释 |
| 41 | ✅ 属实，建议做 | pages 实为 21 个、stores 实为 10 个、PolicyEvolution 已删；README 同步成本低 |
| 42 | 🟡 属实，低成本 | 补 `*.tsbuildinfo` 等即可 |

---

# 附录：内网 / 对外上线适配清单

> 补充于 2026-08-10。现状：本地开发形态（uvicorn --reload + Vite dev server + SQLite + 单 APP_KEY 轻鉴权）。以下按"内网多人使用"与"对外开放"两档列出适配点。
> **【二次核验 2026-08-10】** 逐项对照当前代码复核。附录为**按需上线清单**而非必改项：
> - 当前仅本地/课堂单机使用 → A4（可选）、其余均可暂缓；
> - 决定上"内网多人"前 → 无需实施 B/C/E 档；
> - 两条**修正**：A2 比原描述更严重（docker-compose 因缺 Dockerfile 根本起不来）；C6 中"上传目录隔离/随机文件名"**不适用**（当前上传不落盘）。

## A. 部署形态（两档都需要）

| # | 适配点 | 说明 | 核验 |
|---|--------|------|------|
| A1 | 生产化启动 | 去掉 `--reload`，`DEBUG=false`；用 gunicorn + uvicorn workers（或 uvicorn `--workers N`）；Windows 内网可用 NSSM/Task Scheduler 守护，Linux 用 systemd 固定 WorkingDirectory | ✅ 属实：README:20 与 docker-compose 均 `--reload` + `DEBUG=true`；requirements 无 gunicorn |
| A2 | 容器化交付 | 补 multi-arch Dockerfile（linux/amd64 + linux/arm64，README 已预警 docker-compose 缺 Dockerfile）；国内镜像源（华为云 SWR）；`.dockerignore` 排除 .venv/data/logs | ✅ **比原描述更严重**：根目录 docker-compose.yml 的 `build: ./backend`、`./frontend` **均无对应 Dockerfile**，当前 compose 直接构建失败、完全跑不起来；补 Dockerfile 是 A 档中最优先项 |
| A3 | 反向代理 | nginx 终结 HTTPS、托管前端 `vite build` 产物（不再用 dev server）、开启 gzip/brotli、配置 `client_max_body_size`（上传图片）、SSE 端点需 `proxy_buffering off` + 长超时（mnist `/run-stream` 是 SSE，nginx 默认缓冲会破坏流式推送） | ✅ 属实：无任何 nginx 配置；`/run-stream` 为 SSE（mnist.py:167 async + StreamingResponse），代理注意事项准确 |
| A4 | 前端构建配置 | `VITE_API_BASE_URL` 按环境注入；补 `.env.example`；vite.config 代理目标改环境变量 | ✅ 属实：`VITE_API_BASE_URL` 已生效（client.ts:8-10）；`VITE_APP_KEY` 无 .env.example（=#39）；vite.config:17 硬编码 `127.0.0.1:8000`（=#38） |
| A5 | 多环境配置 | dev / intranet / prod 三套配置，启动时校验关键配置（app_key、cors、debug）并打印自检结果 | ✅ 属实：无环境区分，仅 backend/.env.example + frontend/.env 一份 |

## B. 用户体系与数据隔离（多人使用的最大缺口）

| # | 适配点 | 说明 | 核验 |
|---|--------|------|------|
| B1 | 账号体系 | 当前单 APP_KEY 无法区分用户。内网建议对接 SSO（LDAP / 企业微信 / 钉钉 OAuth）；独立部署则自建注册登录（密码 bcrypt/argon2，JWT access+refresh，登录限流防爆破） | ✅ 属实：auth.py 仅单 `X-App-Key` hmac 校验（app_key 留空即放行），无任何用户概念 |
| B2 | 角色权限 | 学生 / 教师 / 管理员三类：教师可查看班级学生报告、复审 Reviewer 评分；管理员管用户与配额 | ✅ 属实：无角色/权限模型，所有请求等权 |
| B3 | 数据隔离 | sessions / experiments / 各实验 run 表当前全局可见，需加 `user_id` 外键 + 查询层行级过滤（否则任何登录用户可看/删他人实验，现有 `DELETE /sessions/{id}` 无属主校验） | ✅ 属实且为**内网档最大缺口**：sessions.py:15 `list_sessions` 全量返回、sessions.py:66-73 `DELETE /{id}` 无任何属主校验；Session 仅带 `student_id` 弱字段（前端可任意传）无外键约束 |
| B4 | 数据库升级 | SQLite → PostgreSQL/MySQL（多人并发写入）；引入 Alembic 管理迁移；连接池配置；先修 #6（database_url 配置生效）才有切换前提 | ✅ 属实：database.py:6 硬编码 SQLite；无 Alembic；先修 #6 前提成立 |
| B5 | Token 配额 | 已有 🪙 token 用量统计，落到按用户维度 + 每日/每月限额，防 LLM 费用失控（对中小学生场景尤其必要） | ✅ 属实：agent_gateway.py:61-69 `_usage` 全局累计、无用户维度、无限额 |

## C. 安全加固（对外开放档必须）

| # | 适配点 | 说明 | 核验 |
|---|--------|------|------|
| C1 | HTTPS 强制 | HSTS、HTTP→HTTPS 跳转；LLM API Key 目前明文走 HTTP 头（审查 #12），对外必须加密传输 | ✅ 属实：createAgentClient 以 `X-API-Key` 明文头发送（client.ts:53）；无 TLS 配置 |
| C2 | CORS 收窄 | 删掉局域网网段 regex（审查 #9），白名单只留正式域名 | 🟡 **仅对外档生效，内网档勿动**：regex（main.py:57-63）是局域网访问的功能需求（=#9 核验"设计使然"）；只有确定走公网域名时才需删除，否则删了内网设备无法访问 |
| C3 | 安全响应头 | CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy（可用 secure 库或 nginx 统一加） | ✅ 属实：main.py 无任何安全响应头中间件 |
| C4 | LLM Key 管理 | 改为后端统一管理服务商密钥（学生不自带 key），前端只传会话凭证；密钥存环境变量/密管系统，不入库不明文 | ✅ 属实：当前学生自带 key 经前端传（client.ts:53）；架构级改动 |
| C5 | 限流升级 | 现有按 IP 限流，补充按用户维度；LLM/训练类端点单独低配额；`/auth` 登录端点防爆破锁定 | ✅ 属实：rate_limit.py:53-58 仅按 `client_ip`（含 X-Forwarded-For 可伪造）；无用户维度 |
| C6 | 上传加固 | 已有白名单+大小限制，补 magic number 文件类型嗅探、上传目录与代码隔离、随机文件名（防路径穿越与伪装文件） | 🟡 **半适用**：mnist.py:304-325 已有 model_id 白名单 + 5MB 限制（413）✅；但图片**不落盘**（`preprocess_upload_image` 直接 bytes→tensor，无保存目录），故"上传目录隔离、随机文件名"两条**不适用**；仅需补 magic number 嗅探（防伪装文件触发 PIL 处理异常） |
| C7 | 审计日志 | 登录、删除、导出、改密钥等敏感操作留痕（谁、何时、对什么） | ✅ 属实：仅通用请求日志（main.py:20-40），无敏感操作审计 |
| C8 | 漏洞扫描进 CI | pip-audit + npm audit + Trivy 镜像扫描，阻断高危漏洞上线 | ✅ 属实：无 CI、无扫描（=#37） |
| C9 | 公网暴露面 | 若"对外"=互联网：走域名 + WAF/云防火墙；`/docs`、`/openapi.json` 生产关闭；`/health` 去掉路径信息（审查 #10） | ✅ 属实：main.py 未关闭 `/docs`/`openapi.json`（默认开启）；`/health` 泄露 sys.executable + cwd（main.py:174-175） |

## D. 运维与可观测性

| # | 适配点 | 说明 | 核验 |
|---|--------|------|------|
| D1 | 日志 | 结构化 JSON 日志 + RotatingFileHandler 轮转（现 app.log 等无轮转会无限涨）；按级别分文件 | ✅ 属实：main.py:29、101 均用 `FileHandler`，无 RotatingFileHandler，app.log 无限增长 |
| D2 | 监控告警 | Prometheus `/metrics`（请求量、延迟、训练队列长度、LLM 费用）；磁盘告警（data/ 下模型 .pth 与 DB 增长） | ✅ 属实：无 `/metrics` 端点 |
| D3 | 任务队列 | MNIST 训练目前是进程内后台线程 + 互斥锁，多 worker 部署会失效；改 RQ/Celery + Redis，支持排队与进度持久化 | ✅ 属实：model_manager.py:240 `threading.Thread` 进程内线程 + `_train_lock`；仅单 worker 有效 |
| D4 | 备份 | 定时备份 DB 与用户数据（保留 N 天）；恢复演练 | ✅ 属实：无任何备份脚本 |
| D5 | CI/CD | GitHub Actions / 内网 GitLab CI：跑 run_tests.py（先修审查 #7）→ 构建镜像 → 部署 | ✅ 属实：无 .github/workflows |

## E. 合规（面向中小学生 + 对外开放，必须）

| # | 适配点 | 说明 | 核验 |
|---|--------|------|------|
| E1 | 未成年人保护 | 用户为中小学生：个人信息最小化收集（不强制真实姓名/手机）、隐私政策与监护人告知、提供数据删除入口 | ✅ 属流程/合规项：当前 Session.student_id 为自由文本弱字段，无用户个人信息体系，无法代码核验；仅当决定对外开放时按此推进 |
| E2 | 内容安全 | LLM 输出面向学生需过滤敏感内容；用户输入/上传内容按需过内容安全接口（如腾讯云天御） | 🟡 可代码核验部分：无任何内容过滤接口接入；纯本地/课堂自用可暂缓 |
| E3 | ICP 备案 | 对公众开放且用国内服务器/域名需 ICP 备案；仅内网则不需要 | 🟡 流程项，非代码：仅内网部署则**不需要** |
| E4 | 日志与存储脱敏 | LLM 上下文落盘内容脱敏（审查 #11 方向延伸）；明确数据保留周期 | 🟡 属实但低优先：agent_gateway.py `_call_log` 含 input/output 明文（内存 maxlen=200 不落盘）；token 用量落盘不含内容。与 #11 同理，内网场景风险低 |

## F. 上线优先级建议（经二次核验修正）

**内网档（最小集）**：A2（补 Dockerfile，当前 compose 直接失败）+ A1 + B3（数据隔离，最大缺口）+ D1（日志轮转）
**内网档（可选）**：A3/A4、B1、B5、C5、D4
**对外档（在内网档之上追加）**：C1/C2（**仅对外时删 regex**）/C3/C4/C6（仅 magic number）/C8/C9 + E1-E4 全部 + D2/D3/D5

> 提示：B3（数据隔离）与 C4（Key 后端托管）是架构级改动，建议在内网试运行前完成，避免上线后再动数据结构。
> **核验修正**：原"内网档最小集"含 C2（删局域网 regex）——与 #9 核验冲突，**内网档不应删 regex**，已移入对外档；原"内网档最小集"未含 A2，现已将其升为最高优先（无 Dockerfile 则 compose 不可用）。
