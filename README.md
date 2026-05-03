# stock-analyzer — A 股短线策略分析工具

基于 FastAPI + React/TypeScript 的全栈开源工具，内置 15 个技术指标选股策略（含 5 个主升浪实战买点、10 个经典信号），支持自定义策略、全市场扫描、板块热度分析、结果分组导出。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | FastAPI + uvicorn |
| 数据源 | AKShare（新浪 / 东方财富） |
| 技术指标 | pandas-ta（纯 Python，非 ta-lib） |
| ORM / 数据库 | SQLAlchemy + SQLite |
| 前端框架 | React 18 + TypeScript |
| UI 组件库 | Ant Design 5 |
| 图表 | ECharts 5 |
| 状态管理 | Zustand |
| 构建工具 | Vite 5 |

---

## 快速开始

```bash
# 1. 安装依赖（后端 pip + 前端 npm）
scripts\install.bat

# 2. 启动后端（uvicorn，端口 8000）
scripts\start_backend.bat

# 3. 启动前端（Vite dev server，端口 5173）
scripts\start_frontend.bat

# 4. 浏览器访问
http://localhost:5173
```

> **注意**：AKShare 首次启动需要加载全市场数据，约 20-30 秒。启动时后台线程会自动预热缓存。

---

## 功能详解

### 📊 仪表盘（`/`）

- **大盘指数** — 上证、深证、创业板实时行情（AKShare 缓存 60s）
- **概览卡片** — 策略总数 / 今日匹配数 / 最近运行策略
- **最新信号** — 评分 ≥80 的 Top10 结果，按股票去重
- **快速扫描** — 顶栏一键运行所有已启用策略

### ⚙️ 策略管理（`/strategies`）

#### 内置策略（15 个）

**主升浪捕捉（实战买点）：**
| # | 策略 | 原理 |
|---|------|------|
| 1 | 三阴不破阳 | 涨停后连调 3 天不破涨停实体，第 4 天放量收阳 |
| 2 | 缩倍量洗盘 | 涨停后出现量比腰斩的缩量阴线，再收阳站上 |
| 3 | 上影试盘+下影洗盘 | 涨停后先冲高回落（上影）再探底回升（下影） |
| 4 | 连阳缩量横盘 | 连续小阳线 + 量能持续萎缩，主力锁仓 |
| 5 | 三重过滤验证 | EMA9>EMA150 + DIF 上穿 DEA + 价涨量增 |

**经典技术信号：**
| # | 策略 | 原理 |
|---|------|------|
| 6 | MACD 金叉 | DIF 上穿 DEA，短线看涨 |
| 7 | MACD 底背离 | 股价新低但 MACD 未新低，下跌力度减弱 |
| 8 | KDJ 超卖反弹 | J 值 <0 后拐头向上，灵敏反弹信号 |
| 9 | RSI 超跌反弹 | RSI<30 且向上拐头 |
| 10 | 均线金叉（短线） | MA5 上穿 MA10 + 成交量放大 50% |
| 11 | 放量突破 MA20 | 股价放量站稳 20 日均线 |
| 12 | 涨停首板 | 近期首次涨停，资金刚开始炒作 |
| 13 | 布林线突破 | 股价放量冲出布林线上轨 |
| 14 | 组合信号（高胜率） | MACD 金叉 + KDJ 超卖 + 放量，三信号共振 |
| 15 | 强势上涨+回调不破均线 | 均线多头排列，回调不破 20 日线且缩量止跌 |

#### 操作功能

- **拖拽排序** — 长按拖动策略卡片交换位置，顺序持久化
- **启用 / 禁用** — 切换策略开关，禁用策略不参与扫描
- **删除 / 恢复** — 删除后可在「可添加策略」中重新加入
- **批量管理** — 弹窗多选，批量添加 / 移除 / 启用 / 禁用
- **自定义策略** — AND/OR 逻辑组合条件（价格、均线、成交量、MACD、RSI、KDJ、涨跌幅）
- **单策略运行** — 指定扫描股票数量（limit=0 扫描全部）
- **全策略扫描** — 一键运行所有已启用策略

### 📋 扫描结果（`/results`）

- **分组展示** — 同一只股票命中多个策略时合并为一行，叠加策略标签，匹配数 >1 时金色高亮
- **评分** — 显示该股票的最高评分，hover 查看各策略评分明细
- **板块筛选** — 按行业/概念板块过滤（数据来源：东方财富概念+行业板块成分股）
- **日期 / 策略筛选** — 查看历史某日或特定策略的扫描结果
- **关键词搜索** — 模糊匹配股票代码、名称、策略名
- **评分门槛** — 设置最低评分过滤
- **CSV 导出** — 导出当前筛选结果，包含所有策略详情

### 🔥 板块热度（`/sectors`）

- **概念 / 行业板块** — 从东方财富获取全市场概念（~400+）和行业板块
- **热度评分** — 综合涨幅、量比、涨停密度、资金流向等多维度的 0-100 评分
- **热度分解** — 每个板块展示各维度得分明细
- **涨停统计** — 每个板块内涨停股数量（按板块独立统计，非全局）
- **板块 K 线** — 点击进入板块详情页，查看板块指数 K 线图
- **成分股列表** — 板块内成分股代码，可点击跳转个股详情
- **板块标签** — 每只股票详情页展示所属板块标签，支持点击跳转

### 📈 个股详情（`/stock/:code`）

- **K 线图** — 五日 / 日 K / 周 K / 月 K / 季 K / 年 K 多周期切换
- **技术指标副图** — MACD（DIF/DEA/柱）+ RSI（含超买超卖线）
- **均线系统** — MA5 / MA10 / MA20
- **点击十字光标** — 查看任意日期详细数据（OHLC、MA、MACD、KDJ、布林带）
- **策略信号** — 该股票历史命中过的策略及评分
- **板块标签** — 多板块标签，点击跳转板块详情
- **数据网格** — 今开、最高、最低、成交量、成交额、昨收等

### 🔍 股票搜索（`/search`）

- **实时搜索** — 输入代码或名称，300ms 防抖自动搜索
- **按 Enter / 点击结果** — 保存搜索词到历史记录（输入过程中不会保存不完整的词）
- **历史记录管理** — hover 标签显示 × 可逐条删除，支持一键清空全部
- **内嵌 K 线** — 点击搜索结果展开该股票的 K 线图预览

---

## API 接口总览

### `/api/stocks/*` — 股票数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stocks/search?keyword=` | 搜索股票（代码/名称模糊匹配） |
| GET | `/api/stocks/market/quotes` | 大盘指数实时行情 |
| GET | `/api/stocks/{code}/detail` | 个股详情（K 线 + 全部技术指标） |
| GET | `/api/stocks/{code}/kline` | K 线原始数据 |
| GET | `/api/stocks/{code}/sectors` | 个股所属板块 |
| POST | `/api/stocks/sectors/batch` | 批量查询多只股票所属板块 |
| POST | `/api/stocks/search/history` | 保存搜索关键词 |
| GET | `/api/stocks/search/history` | 获取搜索历史 |
| DELETE | `/api/stocks/search/history` | 清空搜索历史 |
| DELETE | `/api/stocks/search/history/{keyword}` | 删除单个搜索关键词 |

### `/api/strategies/*` — 策略管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/strategies` | 获取所有策略（按 sort_order 排序） |
| GET | `/api/strategies/{id}` | 获取单个策略详情 |
| POST | `/api/strategies` | 创建自定义策略 |
| DELETE | `/api/strategies/{id}` | 删除策略 |
| PATCH | `/api/strategies/{id}/toggle` | 启用 / 禁用策略 |
| POST | `/api/strategies/{id}/move?direction=` | 调整排序（上移/下移） |
| POST | `/api/strategies/reorder` | 拖拽排序（交换两个策略） |
| POST | `/api/strategies/{id}/run?limit=` | 运行单个策略（limit=0 扫描全部） |
| POST | `/api/strategies/run-all?limit=` | 运行所有已启用策略 |
| GET | `/api/strategies/results?date=&strategy_id=` | 获取扫描结果 |
| GET | `/api/strategies/builtin/available` | 可添加的内置策略列表 |
| POST | `/api/strategies/builtin/add` | 添加内置策略 |
| GET | `/api/strategies/builtin/all` | 所有内置策略及其状态 |
| POST | `/api/strategies/builtin/batch` | 批量管理内置策略 |

### `/api/sectors/*` — 板块热度

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sectors/heatmap` | 板块热度评分列表 |
| GET | `/api/sectors/{name}?type=` | 板块详情（K 线 + 成分股） |

---

## 配置说明

所有配置项位于 `backend/config.py`：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `MAX_SCAN_STOCKS` | 500 | 单次扫描最大股票数（limit=0 覆盖此限制） |
| `CACHE_EXPIRE_HOURS` | 48 | K 线数据缓存过期时间 |
| `AKSHARE_TIMEOUT` | 30 | AKShare 请求超时（秒） |
| `SCAN_WORKERS` | 8 | 策略扫描并发线程数 |

---

## 数据源说明

所有行情数据来自 **AKShare**（[GitHub](https://github.com/akfamily/akshare)），底层调用新浪财经 / 东方财富公开 API。

- **全市场股票列表** — `stock_zh_a_spot()`（新浪）
- **个股 K 线** — `stock_zh_a_daily()`（新浪）
- **大盘指数** — `stock_zh_index_spot_sina()`（新浪）
- **概念板块成分股** — `stock_board_concept_cons_em()`（东方财富）
- **行业板块成分股** — `stock_board_industry_cons_em()`（东方财富）

> 需要互联网连接。AKShare 接口可能因第三方 API 变更而失效，后端所有端点均做了异常处理。

---

## 数据库

SQLite 文件：`backend/stock_analyzer.db`

主要表：
- **`stocks`** — 股票基本信息（代码、名称、市场）
- **`stock_daily`** — 日 K 线 + 技术指标（MA/MACD/RSI/KDJ/布林带）
- **`strategies`** — 策略定义（内置 + 自定义，含 sort_order）
- **`strategy_results`** — 扫描结果（策略→股票匹配记录）
- **`search_history`** — 搜索关键词历史

---

## 注意事项

- **Windows only** — 启动脚本为 `.bat`，不支持 macOS/Linux
- **无测试覆盖** — 仓库不包含单元测试
- **后端无 lint/typecheck** — 仅前端 `npm run build` 包含 TypeScript 检查
- **无 `.gitignore`** — 提交时注意排除 `stock_analyzer.db`、`node_modules/`、`__pycache__/`
- **AKShare 可能静默失败** — 网络问题或 API 变更时，各接口返回空数据而非报错
