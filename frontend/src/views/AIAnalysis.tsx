import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Input, Button, Card, Tag, Progress, Spin, Empty, message, Typography,
  Tooltip, Divider, Space,
} from 'antd'
import {
  ThunderboltOutlined, RobotOutlined, SearchOutlined, ReloadOutlined,
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

const { Text, Title, Paragraph } = Typography

// ========================================
// 辅助函数
// ========================================

const SCORE_COLORS: Record<string, string> = {
  high: '#cf1322',
  medium: '#fa8c16',
  low: '#1677ff',
  empty: '#d9d9d9',
}

function getScoreColor(score: number): string {
  if (score >= 80) return SCORE_COLORS.high
  if (score >= 60) return SCORE_COLORS.medium
  if (score >= 40) return SCORE_COLORS.low
  return SCORE_COLORS.empty
}

function getScoreStatus(score: number): 'success' | 'active' | 'normal' | 'exception' {
  if (score >= 80) return 'success'
  if (score >= 60) return 'active'
  if (score >= 40) return 'normal'
  return 'exception'
}

const TREND_ICONS: Record<string, React.ReactNode> = {
  '看涨': <RiseOutlined style={{ color: '#cf1322' }} />,
  'bullish': <RiseOutlined style={{ color: '#cf1322' }} />,
  '看跌': <FallOutlined style={{ color: '#389e0d' }} />,
  'bearish': <FallOutlined style={{ color: '#389e0d' }} />,
  '震荡': <MinusOutlined style={{ color: '#1677ff' }} />,
  'sideways': <MinusOutlined style={{ color: '#1677ff' }} />,
}

const CONFIDENCE_TAGS: Record<string, { color: string; text: string }> = {
  '高': { color: 'success', text: '高置信度' },
  'high': { color: 'success', text: '高置信度' },
  '中': { color: 'processing', text: '中等置信度' },
  'medium': { color: 'processing', text: '中等置信度' },
  '低': { color: 'warning', text: '低置信度' },
  'low': { color: 'warning', text: '低置信度' },
}

function getTrendInfo(prediction: string) {
  const lower = prediction?.toLowerCase() || ''
  if (lower.includes('看涨') || lower.includes('bull') || lower.includes('涨') || lower.includes('up')) {
    return { icon: <RiseOutlined style={{ color: '#cf1322', fontSize: 18 }} />, color: '#cf1322', text: prediction }
  }
  if (lower.includes('看跌') || lower.includes('bear') || lower.includes('跌') || lower.includes('down')) {
    return { icon: <FallOutlined style={{ color: '#389e0d', fontSize: 18 }} />, color: '#389e0d', text: prediction }
  }
  return { icon: <MinusOutlined style={{ color: '#1677ff', fontSize: 18 }} />, color: '#1677ff', text: prediction }
}

// ========================================
// 页面组件
// ========================================

const AIAnalysis: React.FC = () => {
  const navigate = useNavigate()

  // 状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [selectedStock, setSelectedStock] = useState<{ code: string; name: string } | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)

  const [llmStatus, setLLMStatus] = useState<LLMStatus | null>(null)
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [scanStockCode, setScanStockCode] = useState('')

  // LLM 状态检查
  useEffect(() => {
    getLLMStatus()
      .then(setLLMStatus)
      .catch(() => setLLMStatus({ available: false, provider: '未知', model: '未知' }))
  }, [])

  // 加载当日扫描结果（用作快捷列表）
  useEffect(() => {
    const today = dayjs().format('YYYY-MM-DD')
    getResults(today).then(res => {
      if (res?.results?.length) {
        // 提取唯一股票列表
        const seen = new Map<string, { code: string; name: string; strategies: string[] }>()
        for (const r of res.results) {
          const entry = seen.get(r.stock_code) || { code: r.stock_code, name: r.stock_name || r.stock_code, strategies: [] as string[] }
          entry.strategies.push(r.strategy_name)
          seen.set(r.stock_code, entry)
        }
        const stocks = Array.from(seen.values()).sort((a, b) => b.strategies.length - a.strategies.length)
        // 存储为简单格式供 UI 使用
        setScanResults(stocks.map((s: any) => ({
          strategy_name: s.strategies.join(', '),
          score: 0,
          reason: `${s.strategies.length} 个策略命中`,
        })) as any)
        setScanStockCode(stocks.map(s => s.code).join(','))
      }
    }).catch(() => { /* 静默失败 */ })
  }, [])

  // 搜索股票
  const handleSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    try {
      const res = await searchStocks(keyword)
      setSearchResults(res?.stocks?.slice(0, 10) || [])
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
      let result: any
      if (withScan) {
        result = await analyzeWithScan(code)
        setScanResults(result.scan_results || [])
      } else {
        result = await analyzeStock(code, name, 90)
      }
      setAnalysisResult(result)
      if (!result.success) {
        message.warning(result.error_message || '分析失败')
      } else {
        message.success(`${name || code} AI 分析完成`)
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '分析请求失败')
    } finally {
      setAnalyzeLoading(false)
    }
  }, [])

  // 搜索回车
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch(searchKeyword)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 190px)' }}>
      {/* ======== 左侧面板 ======== */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 股票搜索卡片 */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <SearchOutlined style={{ color: '#1677ff' }} />
            <Text strong>股票搜索</Text>
          </div>
          <Input.Search
            placeholder="输入代码或名称搜索..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onSearch={v => handleSearch(v)}
            onKeyDown={onSearchKeyDown}
            loading={searchLoading}
            style={{ marginBottom: 8 }}
          />

          {/* 搜索结果列表 */}
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {searchResults.map(stock => (
                <div
                  key={stock.code}
                  onClick={() => {
                    setSelectedStock({ code: stock.code, name: stock.name })
                    setSearchResults([])
                    setSearchKeyword('')
                  }}
                  style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: selectedStock?.code === stock.code ? '#f0f5ff' : 'transparent',
                    border: selectedStock?.code === stock.code ? '1px solid #d6e4ff' : '1px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (selectedStock?.code !== stock.code) {
                      e.currentTarget.style.background = '#fafafa'
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedStock?.code !== stock.code) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <span>
                    <Text style={{ fontSize: 13 }}>{stock.code}</Text>
                    <Text style={{ marginLeft: 8, fontSize: 13 }}>{stock.name}</Text>
                  </span>
                  {stock.market && (
                    <Tag style={{ fontSize: 11, lineHeight: '18px' }}>{stock.market}</Tag>
                  )}
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchKeyword && !searchLoading && (
            <Empty description="未找到匹配股票" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
          )}
        </Card>

        {/* 选中股票 + 分析按钮 */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          {selectedStock ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong style={{ fontSize: 16, color: '#1677ff' }}>{selectedStock.name}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>{selectedStock.code}</Text>
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => setSelectedStock(null)}
                />
              </div>

              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Button
                  type="primary"
                  block
                  icon={<RobotOutlined />}
                  loading={analyzeLoading}
                  onClick={() => handleAnalyze(selectedStock.code, selectedStock.name, false)}
                  style={{ height: 40, borderRadius: 10, fontSize: 14 }}
                >
                  AI 智能分析
                </Button>
                <Button
                  block
                  icon={<ThunderboltOutlined />}
                  loading={analyzeLoading}
                  onClick={() => handleAnalyze(selectedStock.code, selectedStock.name, true)}
                  style={{ height: 36, borderRadius: 10 }}
                >
                  策略扫描 + AI 分析
                </Button>
              </Space>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <RobotOutlined style={{ fontSize: 36, color: '#d9d9d9' }} />
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">搜索并选择一只股票<br />开始 AI 分析</Text>
              </div>
            </div>
          )}
        </Card>

        {/* LLM 状态 */}
        {llmStatus && (
          <Card
            size="small"
            styles={{ body: { padding: 12 } }}
            style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                AI 引擎
              </Text>
              <Space size={4}>
                <Tag color={llmStatus.available ? 'success' : 'error'} style={{ fontSize: 11 }}>
                  {llmStatus.available ? '已就绪' : '未配置'}
                </Tag>
                {llmStatus.available && (
                  <Text type="secondary" style={{ fontSize: 11 }}>{llmStatus.model}</Text>
                )}
              </Space>
            </div>
          </Card>
        )}

        {/* 今日扫描结果快捷列表 */}
        {scanResults.length > 0 && (
          <Card
            size="small"
            styles={{ body: { padding: 0 } }}
            style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flex: 1, overflow: 'auto' }}
            title={
              <span style={{ fontSize: 13 }}>
                <FundOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                今日扫描结果
              </span>
            }
          >
            {/* 这里显示从 scanResults 中提取的股票 */}
            <_ScanStocksList
              onSelect={(code, name) => {
                setSelectedStock({ code, name })
                setSearchKeyword('')
                setSearchResults([])
              }}
              selectedCode={selectedStock?.code}
            />
          </Card>
        )}
      </div>

      {/* ======== 右侧分析结果 ======== */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {analyzeLoading ? (
          <Card style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center', padding: '80px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">AI 正在分析 {selectedStock?.name || ''}，请稍候...</Text>
            </div>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>通常需要 10-30 秒，取决于模型响应速度</Text>
            </div>
          </Card>
        ) : analysisResult ? (
          <_AnalysisDisplay result={analysisResult} />
        ) : (
          <Card style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center', padding: '80px 0' }}>
            <RobotOutlined style={{ fontSize: 64, color: '#e8e8e8' }} />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 16 }}>AI 智能分析面板</Text>
            </div>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                选择左侧股票，点击「AI 智能分析」<br />
                获取基于技术面和策略信号的综合研判
              </Text>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ========================================
// 扫描结果股票列表子组件
// ========================================

const _ScanStocksList: React.FC<{
  onSelect: (code: string, name: string) => void
  selectedCode?: string
}> = ({ onSelect, selectedCode }) => {
  const [stocks, setStocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = dayjs().format('YYYY-MM-DD')
    getResults(today)
      .then(res => {
        if (res?.results?.length) {
          const grouped = new Map<string, { code: string; name: string; strategies: string[]; totalScore: number }>()
          for (const r of res.results) {
            const entry = grouped.get(r.stock_code) || { code: r.stock_code, name: r.stock_name || r.stock_code, strategies: [] as string[], totalScore: 0 }
            entry.strategies.push(r.strategy_name)
            entry.totalScore = Math.max(entry.totalScore, r.score || 0)
            grouped.set(r.stock_code, entry)
          }
          setStocks(Array.from(grouped.values()).sort((a, b) => b.totalScore - a.totalScore).slice(0, 30))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>
  }

  if (!stocks.length) {
    return <Empty description="今日暂无扫描结果" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
  }

  return (
    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
      {stocks.map(stock => {
        const isSelected = selectedCode === stock.code
        return (
          <div
            key={stock.code}
            onClick={() => onSelect(stock.code, stock.name)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #fafafa',
              background: isSelected ? '#f0f5ff' : 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = isSelected ? '#f0f5ff' : '#fafafa' }}
            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#f0f5ff' : 'transparent' }}
          >
            <div>
              <Text style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>{stock.name}</Text>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{stock.code}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12, color: getScoreColor(stock.totalScore) }}>
                {stock.totalScore.toFixed(0)}
              </Text>
              <Tag style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>
                {stock.strategies.length}策略
              </Tag>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ========================================
// 分析结果展示子组件
// ========================================

const _AnalysisDisplay: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const scoreColor = getScoreColor(result.sentiment_score)
  const trendInfo = getTrendInfo(result.trend_prediction)
  const confTag = CONFIDENCE_TAGS[result.confidence_level] || { color: 'default', text: result.confidence_level }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 核心评分卡片 */}
      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          {/* 评分仪表盘 */}
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              size={160}
              percent={result.sentiment_score}
              strokeColor={scoreColor}
              format={percent => (
                <div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
                    {percent}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>综合评分</div>
                </div>
              )}
              style={{ marginBottom: 0 }}
            />
          </div>

          {/* 股票信息 + 核心判断 */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text strong style={{ fontSize: 20 }}>{result.name}</Text>
              <Text type="secondary" style={{ fontSize: 14 }}>{result.code}</Text>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {/* 趋势 */}
              <div style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: trendInfo.color + '0f',
                border: `1px solid ${trendInfo.color}30`,
              }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>趋势预测</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {trendInfo.icon}
                  <Text strong style={{ fontSize: 16, color: trendInfo.color }}>
                    {result.trend_prediction}
                  </Text>
                </div>
              </div>

              {/* 操作建议 */}
              <div style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: scoreColor + '0f',
                border: `1px solid ${scoreColor}30`,
              }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>操作建议</div>
                <Text strong style={{ fontSize: 16, color: scoreColor }}>
                  {result.operation_advice}
                </Text>
              </div>

              {/* 置信度 */}
              <div style={{ padding: '8px 16px', borderRadius: 10, background: '#f5f5f5' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>置信度</div>
                <Tag color={confTag.color} style={{ fontSize: 13, margin: 0 }}>{confTag.text}</Tag>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 分析摘要 */}
      <Card
        title={<span style={{ fontSize: 14 }}><InfoCircleOutlined style={{ color: '#1677ff', marginRight: 6 }} />分析摘要</span>}
        style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
      >
        <Paragraph style={{ margin: 0, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {result.analysis_summary || '暂无分析摘要'}
        </Paragraph>
      </Card>

      {/* 风险因素 + 关键信号 双列 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card
          title={<span style={{ fontSize: 14 }}><WarningOutlined style={{ color: '#fa8c16', marginRight: 6 }} />风险因素</span>}
          style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          {result.risk_factors?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.risk_factors.map((risk, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: 3, background: '#fa8c16',
                    marginTop: 7, flexShrink: 0,
                  }} />
                  <Text style={{ fontSize: 13 }}>{risk}</Text>
                </div>
              ))}
            </div>
          ) : (
            <Text type="secondary">暂无风险提示</Text>
          )}
        </Card>

        <Card
          title={<span style={{ fontSize: 14 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />关键信号</span>}
          style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          {result.key_signals?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.key_signals.map((signal, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: 3, background: '#52c41a',
                    marginTop: 7, flexShrink: 0,
                  }} />
                  <Text style={{ fontSize: 13 }}>{signal}</Text>
                </div>
              ))}
            </div>
          ) : (
            <Text type="secondary">暂无关键信号</Text>
          )}
        </Card>
      </div>

      {/* 价格参考 */}
      {(result.target_price_high || result.target_price_low || result.stop_loss_price) && (
        <Card
          title={<span style={{ fontSize: 14 }}><AimOutlined style={{ color: '#1677ff', marginRight: 6 }} />价格参考</span>}
          style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          styles={{ header: { borderBottom: '1px solid #f5f5f5' } }}
        >
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {result.target_price_high && (
              <div style={{ padding: '12px 20px', borderRadius: 10, background: '#fff7e6', border: '1px solid #ffd591' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                  <ArrowUpOutlined style={{ color: '#cf1322', marginRight: 4 }} />
                  目标价上限
                </div>
                <Text strong style={{ fontSize: 18, color: '#cf1322' }}>
                  ¥{result.target_price_high.toFixed(2)}
                </Text>
              </div>
            )}
            {result.target_price_low && (
              <div style={{ padding: '12px 20px', borderRadius: 10, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                  <ArrowDownOutlined style={{ color: '#389e0d', marginRight: 4 }} />
                  支撑位/下限
                </div>
                <Text strong style={{ fontSize: 18, color: '#389e0d' }}>
                  ¥{result.target_price_low.toFixed(2)}
                </Text>
              </div>
            )}
            {result.stop_loss_price && (
              <div style={{ padding: '12px 20px', borderRadius: 10, background: '#fff1f0', border: '1px solid #ffa39e' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                  <WarningOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
                  建议止损价
                </div>
                <Text strong style={{ fontSize: 18, color: '#ff4d4f' }}>
                  ¥{result.stop_loss_price.toFixed(2)}
                </Text>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 元信息 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
        {result.model_used && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            模型：{result.model_used}
          </Text>
        )}
        {result.tokens_used > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            Token：{result.tokens_used}
          </Text>
        )}
        {result.elapsed_seconds > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            耗时：{result.elapsed_seconds.toFixed(1)}s
          </Text>
        )}
      </div>
    </div>
  )
}

export default AIAnalysis
