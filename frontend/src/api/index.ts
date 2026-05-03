/**
 * API 服务层
 * 封装所有后端接口调用
 */
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ---------- 前端缓存 ----------
const requestCache = new Map<string, { data: any; timestamp: number }>()
const DEFAULT_TTL = 120_000 // 2 分钟

export function clearApiCache(key?: string) {
  if (key) {
    requestCache.delete(key)
  } else {
    requestCache.clear()
  }
}

async function withCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  const cached = requestCache.get(key)
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T
  }
  const data = await fn()
  requestCache.set(key, { data, timestamp: Date.now() })
  return data
}

// ---------- 股票相关 API ----------

/** 搜索股票 */
export const searchStocks = async (keyword: string) => {
  const res = await api.get('/stocks/search', { params: { keyword } })
  return res.data
}

/** 获取个股详情 */
export const getStockDetail = async (code: string) => {
  const res = await api.get(`/stocks/${code}/detail`)
  return res.data
}

/** 获取K线数据 */
export const getKlineData = async (code: string, days: number = 60) => {
  const res = await api.get(`/stocks/${code}/kline`, { params: { days } })
  return res.data
}

/** 获取实时行情（缓存 2 分钟） */
export const getMarketQuotes = async (forceRefresh = false) => {
  if (forceRefresh) clearApiCache('marketQuotes')
  return withCache('marketQuotes', async () => {
    const res = await api.get('/stocks/market/quotes')
    return res.data
  })
}

// ---------- 策略相关 API ----------

/** 获取所有策略（缓存 2 分钟） */
export const getStrategies = async (forceRefresh = false) => {
  if (forceRefresh) clearApiCache('strategies')
  return withCache('strategies', async () => {
    const res = await api.get('/strategies')
    return res.data
  })
}

/** 获取单个策略 */
export const getStrategy = async (id: number) => {
  const res = await api.get(`/strategies/${id}`)
  return res.data
}

/** 创建自定义策略 */
export const createStrategy = async (data: { name: string; description: string; config: any }) => {
  const res = await api.post('/strategies', data)
  return res.data
}

/** 删除策略（内置策略也可删除） */
export const deleteStrategy = async (id: number) => {
  const res = await api.delete(`/strategies/${id}`)
  return res.data
}

/** 运行单个策略 */
export const runStrategy = async (id: number, limit: number = 200) => {
  const res = await api.post(`/strategies/${id}/run`, null, { params: { limit }, timeout: 120000 })
  return res.data
}

/** 启用/禁用策略 */
export const toggleStrategy = async (id: number) => {
  const res = await api.patch(`/strategies/${id}/toggle`)
  return res.data
}

/** 运行所有策略 */
export const runAllStrategies = async (limit: number = 200) => {
  const res = await api.post('/strategies/run-all', null, { params: { limit }, timeout: 300000 })
  return res.data
}

/** 获取扫描结果（缓存 2 分钟） */
export const getResults = async (date?: string, strategyId?: number, forceRefresh = false) => {
  const key = `results:${date || ''}:${strategyId || ''}`
  if (forceRefresh) clearApiCache(key)
  return withCache(key, async () => {
    const params: any = {}
    if (date) params.date = date
    if (strategyId) params.strategy_id = strategyId
    const res = await api.get('/strategies/results', { params })
    return res.data
  })
}

/** 获取可添加的内置策略列表 */
export const getAvailableBuiltin = async () => {
  const res = await api.get('/strategies/builtin/available')
  return res.data
}

/** 添加内置策略到策略列表 */
export const addBuiltinStrategy = async (name: string) => {
  const res = await api.post('/strategies/builtin/add', { name, config: {} })
  return res.data
}

/** 获取所有内置策略及其状态 */
export const getAllBuiltinStrategies = async () => {
  const res = await api.get('/strategies/builtin/all')
  return res.data
}

/** 批量管理内置策略 */
export const batchManageBuiltin = async (names: string[], action: 'add' | 'delete' | 'enable' | 'disable') => {
  const res = await api.post('/strategies/builtin/batch', { names, action })
  return res.data
}

/** 保存搜索关键词 */
export const saveSearchKeyword = async (keyword: string) => {
  await api.post('/stocks/search/history', null, { params: { keyword } })
}

/** 获取最近搜索关键词 */
export const getSearchHistory = async () => {
  const res = await api.get('/stocks/search/history')
  return res.data
}

export const deleteSearchHistory = async () => {
  const res = await api.delete('/stocks/search/history')
  return res.data
}

export const deleteSearchKeyword = async (keyword: string) => {
  const res = await api.delete(`/stocks/search/history/${encodeURIComponent(keyword)}`)
  return res.data
}

/** 拖拽排序策略 */
export const reorderStrategies = async (sourceId: number, targetId: number) => {
  const res = await api.post('/strategies/reorder', { source_id: sourceId, target_id: targetId })
  return res.data
}

/** 获取板块热度排名 */
export const getSectorHeatmap = async (sectorType?: string) => {
  const params: any = {}
  if (sectorType) params.sector_type = sectorType
  const res = await api.get('/sectors/heatmap', { params })
  return res.data
}

/** 获取板块详情 */
export const getSectorDetail = async (name: string, sectorType = 'concept') => {
  const res = await api.get(`/sectors/${encodeURIComponent(name)}/detail`, { params: { sector_type: sectorType } })
  return res.data
}

/** 获取股票所属板块 */
export const getStockSectors = async (code: string) => {
  const res = await api.get(`/stocks/${code}/sectors`)
  return res.data
}

/** 批量获取多只股票所属板块（推荐使用，替代逐个调用 getStockSectors） */
export const getStocksSectorsBatch = async (codes: string[]) => {
  const res = await api.post('/stocks/sectors/batch', { codes })
  return res.data
}

/** ========== 回测 API ========== */

export interface ExitRule {
  type: 'stop_loss' | 'ma_break' | 'trailing_stop' | 'max_hold'
  pct?: number
  ma?: number
  activate?: number
  pullback?: number
  days?: number
}

export const runBacktest = async (params: {
  strategy_id: number
  start_date: string
  end_date: string
  stock_limit?: number
  min_score?: number
  exit_rules?: ExitRule[]
}) => {
  const res = await api.post('/backtest/run', params, { timeout: 600000 })
  return res.data
}

export const getBacktestRuns = async (strategy_id?: number) => {
  const res = await api.get('/backtest/runs', { params: { strategy_id } })
  return res.data
}

export const getBacktestDetail = async (run_id: number) => {
  const res = await api.get(`/backtest/runs/${run_id}`)
  return res.data
}

export const getBacktestTrades = async (run_id: number, page = 1, pageSize = 50) => {
  const res = await api.get(`/backtest/runs/${run_id}/trades`, { params: { page, page_size: pageSize } })
  return res.data
}

export const getStrategyBacktestSummary = async (strategy_id: number) => {
  const res = await api.get(`/backtest/strategy/${strategy_id}/summary`)
  return res.data
}

export default api
