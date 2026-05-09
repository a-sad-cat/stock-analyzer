/**
 * LLM AI 分析 API
 */
import api from './index'

// ---------- 类型定义 ----------

export interface AnalysisResult {
  code: string
  name: string
  success: boolean
  error_message: string
  sentiment_score: number
  trend_prediction: string
  operation_advice: string
  confidence_level: string
  analysis_summary: string
  risk_factors: string[]
  key_signals: string[]
  target_price_high: number | null
  target_price_low: number | null
  stop_loss_price: number | null
  model_used: string
  tokens_used: number
  elapsed_seconds: number
  data_sources: string[]
}

export interface ScanResult {
  strategy_name: string
  score: number
  reason: string
  signals?: Record<string, any>
}

export interface LLMStatus {
  available: boolean
  provider: string
  model: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  reply: string
  model: string
  tokens: number
}

// ---------- API 函数 ----------

/** 检查 LLM 状态 */
export const getLLMStatus = async (): Promise<LLMStatus> => {
  const res = await api.get('/llm/status')
  return res.data
}

/** 分析单只股票 */
export const analyzeStock = async (
  code: string,
  name?: string,
  days = 90,
): Promise<AnalysisResult> => {
  const res = await api.post('/llm/analyze', { code, name, days }, { timeout: 120000 })
  return res.data
}

/** 批量分析股票 */
export const analyzeBatch = async (
  codes: string[],
  days = 90,
  delaySeconds = 1.0,
): Promise<{ total: number; results: AnalysisResult[] }> => {
  const res = await api.post(
    '/llm/analyze-batch',
    { codes, days, delay_seconds: delaySeconds },
    { timeout: 300000 },
  )
  return res.data
}

/** 扫描 + LLM 综合分析 */
export const analyzeWithScan = async (
  code: string,
  strategyId?: number,
): Promise<AnalysisResult & { scan_results: ScanResult[] }> => {
  const params: any = { code }
  if (strategyId) params.strategy_id = strategyId
  const res = await api.post('/llm/analyze-with-scan', null, { params, timeout: 300000 })
  return res.data
}

/** AI 金融助手对话 */
export const chatWithAI = async (
  messages: ChatMessage[],
  stockCode?: string,
): Promise<ChatResponse> => {
  const res = await api.post('/llm/chat', { messages, stock_code: stockCode }, { timeout: 120000 })
  return res.data
}
