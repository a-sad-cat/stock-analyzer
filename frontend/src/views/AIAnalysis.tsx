import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Input, Button, Card, Tag, Progress, Spin, Empty, message, Typography,
  Space,
} from 'antd'
import {
  RobotOutlined, SearchOutlined, ThunderboltOutlined,
  RiseOutlined, FallOutlined, MinusOutlined, AimOutlined,
  WarningOutlined, CheckCircleOutlined, InfoCircleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, FundOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

import {
  getLLMStatus, analyzeStock, analyzeWithScan,
  type AnalysisResult, type ScanResult, type LLMStatus,
} from '../api/llm'
import { searchStocks, getResults } from '../api/index'

const { Text, Paragraph } = Typography

// ========================================
// 辅助函数
// ========================================
function getScoreColor(score: number): string {
  if (score >= 80) return '#cf1322'
  if (score >= 60) return '#fa8c16'
  if (score >= 40) return '#1677ff'
  return '#d9d9d9'
}

function getTrendInfo(prediction: string) {
  const lower = prediction?.toLowerCase() || ''
  if (lower.includes('涨') || lower.includes('bull') || lower.includes('up')) {
    return { icon: <RiseOutlined style={{ color: '#cf1322' }} />, color: '#cf1322' }
  }
  if (lower.includes('跌') || lower.includes('bear') || lower.includes('down')) {
    return { icon: <FallOutlined style={{ color: '#389e0d' }} />, color: '#389e0d' }
  }
  return { icon: <MinusOutlined style={{ color: '#1677ff' }} />, color: '#1677ff' }
}

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  marginBottom: 12,
}

// ========================================
// 主组件
// ========================================
const AIAnalysis: React.FC = () => {
  // 状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [selectedStock, setSelectedStock] = useState<{ code: string; name: string } | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [scanResults, setScanResults] = useState<ScanResult[]>([])

  const [llmStatus, setLLMStatus] = useState<LLMStatus | null>(null)
  const [todayStocks, setTodayStocks] = useState<any[]>([])

  // LLM 状态
  useEffect(() => {
    getLLMStatus()
      .then(setLLMStatus)
      .catch(() => setLLMStatus({ available: false, provider: '未知', model: '未知' }))
  }, [])

  // 今日扫描结果（快捷选股）
  useEffect(() => {
    getResults(dayjs().format('YYYY-MM-DD')).then(res => {
      if (res?.results?.length) {
        const grouped = new Map<string, { code: string; name: string; count: number; maxScore: number }>()
        for (const r of res.results) {
          const e = grouped.get(r.stock_code) || { code: r.stock_code, name: r.stock_name || r.stock_code, count: 0, maxScore: 0 }
          e.count++
          e.maxScore = Math.max(e.maxScore, r.score || 0)
          grouped.set(r.stock_code, e)
        }
        setTodayStocks(
          Array.from(grouped.values())
            .sort((a, b) => b.maxScore - a.maxScore)
            .slice(0, 12),
        )
      }
    }).catch(() => {})
  }, [])

  // 搜索
  const handleSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const res = await searchStocks(keyword)
      setSearchResults(res?.stocks?.slice(0, 8) || [])
    } catch {
      message.error('搜索失败，请检查网络')
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // 开始分析
  const handleAnalyze = useCallback(async (code: string, name?: string, withScan = false) => {
    setAnalyzeLoading(true)
    setAnalysisResult(null)
    try {
      const result: any = withScan
        ? await analyzeWithScan(code)
        : await analyzeStock(code, name, 90)
      setAnalysisResult(result)
      if (result.scan_results) setScanResults(result.scan_results)
      if (!result.success) {
        message.warning(result.error_message || '分析失败')
      } else {
        message.success(`${name || code} AI 分析完成`)
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '分析请求失败，请检查 LLM API Key 是否配置')
    } finally {
      setAnalyzeLoading(false)
    }
  }, [])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* ======== 顶部：搜索 + 选择区 ======== */}
      <Card size="small" styles={{ body: { padding: 16 } }} style={CARD_STYLE}>
        {/* 标题行 */}
        <div style={{ marginBottom: 12 }}>
          <RobotOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          <Text strong style={{ fontSize: 15, marginLeft: 6 }}>AI 智能分析</Text>
        </div>

        {/* 搜索栏 */}
        <div style={{ position: 'relative' }}>
          <Input
            placeholder="输入股票代码或名称搜索..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onPressEnter={() => handleSearch(searchKeyword)}
            size="large"
            suffix={
              searchLoading ? (
                <Spin size="small" />
              ) : (
                <Button
                  type="primary"
                  size="small"
                  icon={<SearchOutlined />}
                  onClick={() => handleSearch(searchKeyword)}
                  style={{ borderRadius: 6, minWidth: 32 }}
                />
              )
            }
            style={{ borderRadius: 10, paddingRight: 4 }}
          />
        </div>

        {/* 搜索结果 */}
        {searchResults.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10,
          }}>
            {searchResults.map(stock => (
              <div
                key={stock.code}
                onClick={() => {
                  setSelectedStock({ code: stock.code, name: stock.name })
                  setSearchResults([])
                  setSearchKeyword('')
                }}
                style={{
                  padding: '6px 14px',
                  cursor: 'pointer',
                  borderRadius: 8,
                  background: selectedStock?.code === stock.code ? '#e6f4ff' : '#f5f5f5',
                  border: selectedStock?.code === stock.code ? '1px solid #91caff' : '1px solid #f0f0f0',
                  fontSize: 13,
                  transition: 'all 0.15s',
                }}
              >
                {stock.name}
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{stock.code}</Text>
              </div>
            ))}
          </div>
        )}

        {searchResults.length === 0 && searchKeyword && !searchLoading && (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>未找到匹配股票，请尝试其他关键词</Text>
          </div>
        )}

        {/* 今日扫描快捷选择 */}
        {todayStocks.length > 0 && !searchKeyword && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
              <FundOutlined style={{ marginRight: 4 }} />今日策略命中股票（点击快速选择）：
            </Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {todayStocks.map(stock => (
                <div
                  key={stock.code}
                  onClick={() => setSelectedStock({ code: stock.code, name: stock.name })}
                  style={{
                    padding: '5px 12px',
                    cursor: 'pointer',
                    borderRadius: 8,
                    background: selectedStock?.code === stock.code ? '#e6f4ff' : '#fafafa',
                    border: selectedStock?.code === stock.code ? '1px solid #91caff' : '1px solid #f0f0f0',
                    fontSize: 12,
                    transition: 'all 0.15s',
                  }}
                >
                  {stock.name}
                  <Text type="secondary" style={{ fontSize: 10 }}> {stock.code}</Text>
                  <Tag style={{ fontSize: 10, lineHeight: '14px', marginLeft: 4 }}>{stock.count}策略</Tag>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 选中股票 + 操作按钮 */}
        {selectedStock && (
          <div style={{
            marginTop: 12, padding: '12px 16px',
            background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f4ff 100%)',
            borderRadius: 10, border: '1px solid #d6e4ff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong style={{ fontSize: 16, color: '#1677ff' }}>{selectedStock.name}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>{selectedStock.code}</Text>
              </div>
              <Button
                type="text" size="small" danger
                onClick={() => { setSelectedStock(null); setAnalysisResult(null) }}
              >
                清除
              </Button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={analyzeLoading}
                onClick={() => handleAnalyze(selectedStock.code, selectedStock.name, false)}
                style={{ borderRadius: 10 }}
              >
                AI 智能分析
              </Button>
              <Button
                icon={<ThunderboltOutlined />}
                loading={analyzeLoading}
                onClick={() => handleAnalyze(selectedStock.code, selectedStock.name, true)}
                style={{ borderRadius: 10 }}
              >
                策略扫描 + AI
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ======== 加载中 ======== */}
      {analyzeLoading && (
        <Card style={{ ...CARD_STYLE, textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">AI 正在分析，通常需要 5-15 秒...</Text>
          </div>
        </Card>
      )}

      {/* ======== 分析结果 ======== */}
      {analysisResult && !analyzeLoading && (
        <AnalysisResultView
          result={analysisResult}
          scanResults={scanResults}
        />
      )}
    </div>
  )
}

// ========================================
// 分析结果展示
// ========================================

const AnalysisResultView: React.FC<{
  result: AnalysisResult
  scanResults: ScanResult[]
}> = ({ result, scanResults }) => {
  const navigate = useNavigate()
  const scoreColor = getScoreColor(result.sentiment_score)
  const trendInfo = getTrendInfo(result.trend_prediction)

  if (!result.success) {
    return (
      <Card style={CARD_STYLE}>
        <Empty
          description={
            <span>
              <Text type="danger">{result.error_message}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                请检查环境变量 LLM_API_KEY 是否已正确设置
              </Text>
            </span>
          }
        />
      </Card>
    )
  }

  return (
    <>
      {/* 核心评分卡片 */}
      <Card style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* 评分仪表盘 */}
          <Progress
            type="dashboard"
            size={150}
            percent={result.sentiment_score}
            strokeColor={scoreColor}
            format={p => (
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{p}</div>
                <div style={{ fontSize: 11, color: '#999' }}>综合评分</div>
              </div>
            )}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 8 }}>
              <Text
                strong
                style={{ fontSize: 18, color: '#1677ff', cursor: 'pointer' }}
                onClick={() => navigate(`/stock/${result.code}`)}
              >
                {result.name}
              </Text>
              <Text
                type="secondary"
                style={{ marginLeft: 6, cursor: 'pointer' }}
                onClick={() => navigate(`/stock/${result.code}`)}
              >
                {result.code}
              </Text>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <LabelBox color={trendInfo.color} bgColor={trendInfo.color + '10'} icon={trendInfo.icon}
                label="趋势预测" value={result.trend_prediction} />
              <LabelBox color={scoreColor} bgColor={scoreColor + '10'} icon={<AimOutlined style={{ color: scoreColor }} />}
                label="操作建议" value={result.operation_advice} />
              <LabelBox color="#1677ff" bgColor="#f0f5ff" icon={<InfoCircleOutlined style={{ color: '#1677ff' }} />}
                label="置信度" value={result.confidence_level === '高' ? '高置信度' : result.confidence_level === '低' ? '低置信度' : '中等置信度'} />
            </div>
          </div>
        </div>
      </Card>

      {/* 策略扫描结果 */}
      {scanResults.length > 0 && (
        <Card
          title={<Text style={{ fontSize: 14 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />策略命中信号</Text>}
          size="small"
          style={CARD_STYLE}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {scanResults.map((r, i) => (
              <Tag key={i} color="blue" style={{ fontSize: 12, padding: '2px 10px' }}>
                {r.strategy_name}: {r.score.toFixed(0)}分
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 分析摘要 */}
      <Card
        title={<Text style={{ fontSize: 14 }}><InfoCircleOutlined style={{ color: '#1677ff', marginRight: 6 }} />分析摘要</Text>}
        size="small"
        style={CARD_STYLE}
        styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
      >
        <Paragraph style={{ margin: 0, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {result.analysis_summary || '暂无分析摘要'}
        </Paragraph>
      </Card>

      {/* 风险 + 信号 双列 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card
          title={<Text style={{ fontSize: 14 }}><WarningOutlined style={{ color: '#fa8c16', marginRight: 6 }} />风险因素</Text>}
          size="small"
          style={{ ...CARD_STYLE, marginBottom: 0 }}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          {result.risk_factors?.length ? (
            result.risk_factors.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: '#fa8c16', marginTop: 6, flexShrink: 0 }} />
                <Text style={{ fontSize: 13 }}>{r}</Text>
              </div>
            ))
          ) : <Text type="secondary" style={{ fontSize: 13 }}>暂无风险提示</Text>}
        </Card>

        <Card
          title={<Text style={{ fontSize: 14 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />关键信号</Text>}
          size="small"
          style={{ ...CARD_STYLE, marginBottom: 0 }}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          {result.key_signals?.length ? (
            result.key_signals.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: '#52c41a', marginTop: 6, flexShrink: 0 }} />
                <Text style={{ fontSize: 13 }}>{s}</Text>
              </div>
            ))
          ) : <Text type="secondary" style={{ fontSize: 13 }}>暂无关键信号</Text>}
        </Card>
      </div>

      {/* 价格参考 */}
      {(result.target_price_high || result.target_price_low || result.stop_loss_price) && (
        <Card
          title={<Text style={{ fontSize: 14 }}><AimOutlined style={{ color: '#1677ff', marginRight: 6 }} />价格参考</Text>}
          size="small"
          style={CARD_STYLE}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {result.target_price_high && (
              <div style={{ padding: '10px 18px', borderRadius: 10, background: '#fff7e6', border: '1px solid #ffd591' }}>
                <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 2 }}>
                  <ArrowUpOutlined style={{ color: '#cf1322' }} /> 目标价上限
                </Text>
                <Text strong style={{ fontSize: 16, color: '#cf1322' }}>¥{result.target_price_high.toFixed(2)}</Text>
              </div>
            )}
            {result.target_price_low && (
              <div style={{ padding: '10px 18px', borderRadius: 10, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 2 }}>
                  <ArrowDownOutlined style={{ color: '#389e0d' }} /> 支撑位
                </Text>
                <Text strong style={{ fontSize: 16, color: '#389e0d' }}>¥{result.target_price_low.toFixed(2)}</Text>
              </div>
            )}
            {result.stop_loss_price && (
              <div style={{ padding: '10px 18px', borderRadius: 10, background: '#fff1f0', border: '1px solid #ffa39e' }}>
                <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 2 }}>
                  <WarningOutlined style={{ color: '#ff4d4f' }} /> 止损价
                </Text>
                <Text strong style={{ fontSize: 16, color: '#ff4d4f' }}>¥{result.stop_loss_price.toFixed(2)}</Text>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 元信息 */}
      <div style={{ textAlign: 'right', paddingBottom: 12 }}>
        {result.model_used && <Text type="secondary" style={{ fontSize: 11, marginRight: 12 }}>模型：{result.model_used}</Text>}
        {result.tokens_used > 0 && <Text type="secondary" style={{ fontSize: 11, marginRight: 12 }}>Token：{result.tokens_used}</Text>}
        {result.elapsed_seconds > 0 && <Text type="secondary" style={{ fontSize: 11 }}>耗时：{result.elapsed_seconds.toFixed(1)}s</Text>}
      </div>
    </>
  )
}

// ========================================
// 小标签盒子
// ========================================
const LabelBox: React.FC<{
  color: string; bgColor: string; icon: React.ReactNode; label: string; value: string
}> = ({ color, bgColor, icon, label, value }) => (
  <div style={{ padding: '8px 14px', borderRadius: 10, background: bgColor, border: `1px solid ${color}25` }}>
    <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon}
      <Text strong style={{ fontSize: 15, color }}>{value}</Text>
    </div>
  </div>
)

export default AIAnalysis
