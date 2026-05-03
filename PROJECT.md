# stock-analyzer 项目文档

## 项目概述

A 股短线策略分析工具。基于 FastAPI + React 的全栈项目，提供内置技术指标选股策略（MACD/KDJ/RSI/均线/K 线形态等），支持自定义策略、全市场扫描、结果导出。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端框架 | FastAPI | ≥0.110 |
| ASGI 服务器 | uvicorn | ≥0.29 |
| 数据源 | AKShare（新浪源） | ≥1.14 |
| 技术指标 | pandas-ta | ≥0.3.14 |
| ORM | SQLAlchemy | ≥2.0 |
| 数据库 | SQLite（本地文件） | — |
| 前端框架 | React 18 + TypeScript | ^18.3 |
| UI 组件库 | Ant Design 5 | ^5.19 |
| 图表 | ECharts 5 + echarts-for-react | ^5.5 |
| 状态管理 | Zustand | ^4.5 |
| HTTP 客户端 | Axios | ^1.7 |
| 构建工具 | Vite 5 | ^5.3 |

## 目录结构

```
D:\code\stock-analyzer\
├── backend/
│   ├── main.py                    # FastAPI 入口，注册路由和中间件
│   ├── config.py                  # 配置（数据库路径、缓存时间、扫描限制）
│   ├── database.py                # SQLAlchemy 引擎与会话工厂
│   ├── requirements.txt           # Python 依赖
│   ├── stock_analyzer.db          # SQLite 数据库文件
│   ├── _check_strategies.py       # 策略检查调试脚本
│   ├── models/
│   │   ├── stock.py               # Stock（股票基本信息）、StockDaily（日K线）
│   │   └── strategy.py            # Strategy（策略定义）、StrategyResult（扫描结果）
│   ├── routers/
│   │   ├── stocks.py              # /api/stocks/* 股票数据 API
│   │   └── strategies.py          # /api/strategies/* 策略管理 API
│   ├── services/
│   │   └── data_service.py        # AKShare 数据获取、缓存、技术指标计算
│   └── strategies/
│       ├── base.py                # BaseStrategy 抽象基类
│       ├── builtin.py             # 14 个内置策略实现（1197行）
│       └── engine.py              # 策略引擎（注册/运行/管理）
├── frontend/
│   ├── index.html                 # HTML 入口
│   ├── package.json               # 前端依赖
│   ├── vite.config.ts             # Vite 配置（含 /api 代理到 localhost:8000）
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx               # React 入口，ConfigProvider + BrowserRouter
│       ├── App.tsx                # 布局：侧边栏(Sider) + 顶栏(Header) + 内容区
│       ├── index.css              # 全局样式 + Tailwind
│       ├── vite-env.d.ts
│       ├── api/
│       │   └── index.ts           # Axios 封装，所有后端 API 调用
│       ├── components/
│       │   ├── HeaderBar.tsx       # 顶栏：快速扫描按钮、运行状态、时钟
│       │   └── Sidebar.tsx         # 侧边栏导航（仪表盘/策略管理/扫描结果）
│       ├── router/
│       │   └── index.tsx           # 路由配置（4 个页面）
│       ├── stores/
│       │   └── useAppStore.ts      # Zustand 全局状态
│       └── views/
│           ├── Dashboard.tsx       # 仪表盘：大盘指数、概览卡片、运行状态
│           ├── Strategies.tsx      # 策略管理：列表 + 详情 + 新建/添加/运行
│           ├── Results.tsx         # 扫描结果：表格 + 筛选 + 导出 CSV
│           └── StockDetail.tsx     # 个股详情：K线/MACD/RSI 图 + 技术指标
└── scripts/
    ├── install.bat                # 一键安装依赖
    ├── start_backend.bat          # 启动后端（uvicorn）
    └── start_frontend.bat         # 启动前端（vite dev）
```

---

## 后端架构

### 入口 (`main.py`)
- 创建 FastAPI 应用，注册 CORS 中间件
- 创建 SQLite 数据库表
- 注册两个路由前缀：`/api/stocks`、`/api/strategies`
- 提供 `/` 和 `/api/health` 两个健康检查端点

### API 路由

#### `/api/stocks/*` 股票数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stocks/search?keyword=` | 搜索股票（代码/名称模糊匹配） |
| GET | `/api/stocks/{code}/detail` | 个股详情（基本信息 + K线 + 技术指标） |
| GET | `/api/stocks/{code}/kline?days=60` | K线数据（OHLC + MA/MACD/RSI/KDJ/布林） |
| GET | `/api/stocks/market/quotes` | 大盘指数实时行情（上证/深证/创业板） |

#### `/api/strategies/*` 策略管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/strategies` | 获取所有策略列表 |
| GET | `/api/strategies/{id}` | 获取单个策略详情 |
| POST | `/api/strategies` | 创建自定义策略 |
| DELETE | `/api/strategies/{id}` | 删除策略 |
| PATCH | `/api/strategies/{id}/toggle` | 启用/禁用策略 |
| GET | `/api/strategies/builtin/available` | 获取可添加的内置策略 |
| POST | `/api/strategies/builtin/add` | 添加内置策略 |
| POST | `/api/strategies/{id}/run?limit=100` | 运行单个策略扫描 |
| POST | `/api/strategies/run-all?limit=100` | 运行所有已启用策略 |
| GET | `/api/strategies/results?date=&strategy_id=` | 获取扫描结果 |

### 数据服务 (`services/data_service.py`)

- **`get_all_stocks()`** — 从 AKShare(`stock_zh_a_spot`) 获取全市场股票列表，缓存到 SQLite
- **`get_daily_data(code, start, end)`** — 获取个股日K线，使用 AKShare(`stock_zh_a_daily`)，先查缓存再拉取
- **`_add_technical_indicators(df)`** — 用 pandas-ta 计算 MA5/10/20/60/120、MACD、RSI、KDJ、布林带、成交量均线
- **`get_realtime_quotes()`** — 实时行情（`stock_zh_a_spot`）
- **`search_stocks(keyword)`** — 本地数据库模糊搜索
- **`get_stock_detail(code)`** — 整合基本信息和 K 线数据

### 策略系统

#### 基类 (`strategies/base.py`)
- `BaseStrategy` 抽象类，定义 `evaluate(code, name, df) -> dict | None` 接口

#### 内置策略 (`strategies/builtin.py` — 14 个)

**主升浪策略（实战买点）：**
1. **三阴不破阳** — 涨停后连调 3 天不破涨停实体，第 4 天放量收阳
2. **缩倍量洗盘** — 涨停后出现量比腰斩的缩量阴线，再收阳站上
3. **上影试盘+下影洗盘** — 涨停后先冲高回落再探底回升
4. **连阳缩量横盘** — 连续小阳线 + 量能持续萎缩
5. **三重过滤验证** — EMA9>EMA150 + DIF 上穿 DEA + 价涨量增

**经典策略：**
6. **MACD 金叉** — DIF 上穿 DEA
7. **MACD 底背离** — 股价新低但 MACD 未新低
8. **KDJ 超卖反弹** — J 值 <0 后拐头
9. **RSI 超跌反弹** — RSI<30 且向上拐头
10. **均线金叉（短线）** — MA5 上穿 MA10 + 放量
11. **放量突破 MA20** — 股价放量站稳 20 日均线
12. **涨停首板** — 近期首次涨停
13. **布林线突破** — 股价放量突破布林线上轨
14. **组合信号（高胜率）** — MACD 金叉 + KDJ 超卖 + 放量

#### 策略引擎 (`strategies/engine.py`)
- **初始化** — 首次运行时自动将所有内置策略添加到数据库
- **`run_strategy(db, strategy_id, stock_limit)`** — 遍历股票列表，获取 K 线数据，调用策略 `evaluate()`，结果存入 `strategy_results` 表
- **`CustomStrategyExecutor`** — 自定义策略执行器，解析用户配置的条件（AND/OR 逻辑），支持 price/ma/volume/macd/rsi/kdj/pct_chg 条件类型
- 自动过滤 ST/*ST 股票

### 数据库模型

#### Stock（股票基本信息）
| 字段 | 类型 | 说明 |
|------|------|------|
| code | String(10) | 股票代码（唯一索引） |
| name | String(50) | 股票名称 |
| market | String(10) | 市场：SH/SZ/BJ |
| industry | String(50) | 所属行业 |

#### StockDaily（日 K 线数据）
| 字段 | 类型 | 说明 |
|------|------|------|
| code | String(10) | 股票代码 |
| date | Date | 交易日 |
| open/high/low/close | Float | 价 |
| volume/amount | Float | 量 |
| pct_chg | Float | 涨跌幅 |

#### Strategy（策略定义）
| 字段 | 类型 | 说明 |
|------|------|------|
| name | String(100) | 策略名称 |
| type | String(20) | builtin / custom |
| config | JSON | 策略配置（条件列表） |
| enabled | Integer | 是否启用 |
| last_run | DateTime | 上次运行时间 |

#### StrategyResult（扫描结果）
| 字段 | 类型 | 说明 |
|------|------|------|
| strategy_id | Integer | 策略 ID |
| strategy_name | String | 策略名称 |
| stock_code/name | String | 股票信息 |
| score | Float | 匹配评分 0-100 |
| signals | JSON | 关键信号值 |
| reason | Text | 匹配原因描述 |

---

## 前端架构

### 页面路由

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | Dashboard | 仪表盘：大盘指数、概览、策略运行状态 |
| `/strategies` | Strategies | 策略管理：列表 + 详情 + 新建/运行 |
| `/results` | Results | 扫描结果：表格 + 筛选日期/策略 + 导出 CSV |
| `/stock/:code` | StockDetail | 个股详情：K线/MACD/RSI 图表 + 技术指标 |

### 数据流

```
用户操作 → React 组件 → API 层 (axios) → Vite 代理 (/api → localhost:8000)
                                                       ↓
                                          FastAPI 路由 → 数据服务 → AKShare / SQLite
                                                       ↓
                                          策略引擎 → 扫描结果 → SQLite
```

### 关键组件

- **Dashboard** — 调用 `getMarketQuotes`、`getStrategies`、`getResults` 三个接口；大盘指数为空时显示"行情数据暂时无法获取（需要启动AKShare）"
- **Strategies** — 左侧列表 + 右侧详情；支持切换启用/禁用、删除、运行、新建自定义策略、添加内置策略
- **Results** — 带筛选（日期/策略/关键词）的扫描结果表格，支持 CSV 导出
- **StockDetail** — ECharts 展示 K 线（含 MA5/10/20）、MACD、RSI 图；展示策略信号和技术指标

### Vite 配置
- 开发服务器端口 5173
- `/api` 路径代理到 `http://localhost:8000`

---

## 运行方式

```bash
# 安装依赖
scripts\install.bat

# 启动后端（端口 8000）
scripts\start_backend.bat

# 启动前端（端口 5173）
scripts\start_frontend.bat

# 访问 http://localhost:5173
```

---

---

## 性能优化

### StockDetail 接口速度优化

**问题**：`GET /api/stocks/{code}/detail` 每次调用都执行 `ak.stock_zh_a_spot()` 拉取全部 5000+ 股票实时行情（20-30 秒），只为取 3 个字段。

**修复**：
1. `_get_spot_map()` 缓存全市场行情 60 秒，所有接口共享缓存
2. `get_stock_detail()` 不再直接调 AKShare，改用 `_get_spot_map()` 缓存
3. `main.py` 启动时**后台线程预热**缓存，用户第一次请求无需等待

**效果**：缓存命中时耗时从 **25s → 0.3s**

---

## 近期修改记录（2026-05-01）

### Bug 修复

1. **缓存路径不计算技术指标** — `services/data_service.py:174`
   - 缓存路径原先直接返回原始 OHLCV 数据，跳过了 `_add_technical_indicators()`
   - 导致所有依赖指标的策略（MACD/KDJ/RSI/均线等共 12 个）无法评估
   - 修复：缓存路径也调用 `_add_technical_indicators()` 后再返回

2. **pandas 重复日期导致指标计算失败** — `services/data_service.py`
   - AKShare 返回的部分股票数据存在重复日期，`set_index('date')` 后 pandas_ta 报错
   - 修复：在数据保存前 `drop_duplicates(subset=['date'])`，读取时也检查并去重

3. **扫描范围太小** — 多个文件
   - `routers/strategies.py` 默认 `limit=100`，但数据库有 5512 只股票，覆盖率仅 1.8%
   - `config.py` 的 `MAX_SCAN_STOCKS=200` 从未被实际引用
   - 修复：默认值改为 `MAX_SCAN_STOCKS=500`，`limit=0` 支持扫描全部

### 策略阈值调整

| 策略 | 修改前 | 修改后 |
|------|--------|--------|
| **缩倍量洗盘** — 基准涨幅 | ≥9.5%（涨停） | ≥7%（大阳线） |
| **上影试盘+下影洗盘** — 基准涨幅 | ≥7% | ≥5% |
| **三重过滤验证** — 确认涨幅 | >3% | >1.5% |
| **三阴不破阳** — 量比门槛 | <1.3 | <1.1 |
| **三阴不破阳** — 涨幅门槛 | <0.5% | <0.3% |
| **连阳缩量横盘** — 遇阴线 | 立即中断(break) | 跳过继续(continue) |
| **连阳缩量横盘** — 缩量要求 | 缩量天数≥阳线数-1 | 缩量天数≥1 |

### 新增功能

**批量管理内置策略** — 点击"批量管理"按钮打开弹窗：
- 列出全部 14 个内置策略，显示当前状态（已启用/已禁用/未添加）
- 支持多选 + 四种操作：批量添加 / 批量移除 / 批量启用 / 批量禁用
- 新增后端 API：
  - `GET /api/strategies/builtin/all` — 获取所有内置策略及状态
  - `POST /api/strategies/builtin/batch` — 批量操作

---

## 关于"行情数据暂时无法获取"问题

### 显示条件
在 `frontend/src/views/Dashboard.tsx:123-131`：
```tsx
{indices.length > 0 ? (
  // 显示大盘指数
) : (
  <Alert message="行情数据暂时无法获取（需要启动AKShare）" />
)}
```

### 后端对应接口
`backend/routers/stocks.py:67-93` — `GET /api/stocks/market/quotes`
- 调用 `akshare.stock_zh_index_spot_sina()` 获取指数行情
- 如果异常（如网络不通、API 变更），返回 `{"indices": []}`

### 可能原因
1. **网络问题** — AKShare（新浪源）需要访问外网，如果环境不能联网则无数据
2. **AKShare API 变更** — 新浪接口可能变更导致 `stock_zh_index_spot_sina()` 返回空或抛异常
3. **数据未缓存** — 首次启动时 AKShare 需要拉取全市场股票列表（`stock_zh_a_spot()`），可能较慢

### 影响范围
- 只有仪表盘页面的大盘指数卡片受影响
- 策略扫描、个股详情、K 线等其他功能不受影响（各自独立调用 AKShare 接口）
