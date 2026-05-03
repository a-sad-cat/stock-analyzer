import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Typography, Tag, Spin, Alert, Space, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import { getStockDetail, getResults, getStockSectors } from '../api'
import { mobileKlineOption, mobileMacdOption, mobileRsiOption } from '../utils/echartsTheme'

const { Text } = Typography

function formatVol(v: number) {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return v.toFixed(0)
}

function formatMoney(v: number) {
  if (!v) return '-'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return v.toFixed(2)
}

const PERIODS = [
  { key: '5day', label: '五日' },
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
  { key: 'quarter', label: '季K' },
  { key: 'year', label: '年K' },
] as const

type Period = typeof PERIODS[number]['key']

function aggregateKline(data: any[], period: Period) {
  if (!data || data.length === 0) return []
  if (period === 'day') return data
  if (period === '5day') return data.slice(-5)

  const dateMap = new Map<string, any[]>()
  for (const d of data) {
    const parts = d.date.split('-')
    const y = parts[0], m = parts[1], day = parseInt(parts[2])
    let key: string
    if (period === 'week') {
      const dt = new Date(+y, +m - 1, day)
      const ws = new Date(dt)
      ws.setDate(dt.getDate() - dt.getDay() + 1)
      key = ws.toISOString().slice(0, 10)
    } else if (period === 'month') {
      key = `${y}-${m}`
    } else if (period === 'quarter') {
      key = `${y}-Q${Math.ceil(parseInt(m) / 3)}`
    } else {
      key = y
    }
    if (!dateMap.has(key)) dateMap.set(key, [])
    dateMap.get(key)!.push(d)
  }
  return Array.from(dateMap.values()).map((g) => ({
    date: g[0].date,
    open: g[0].open,
    high: Math.max(...g.map((d: any) => d.high)),
    low: Math.min(...g.map((d: any) => d.low)),
    close: g[g.length - 1].close,
    volume: g.reduce((s: number, d: any) => s + d.volume, 0),
  }))
}

const StockDetail: React.FC = () => {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [results, setResults] = useState<any[]>([])
  const [stockSectors, setStockSectors] = useState<any[]>([])
  const [chartPeriod, setChartPeriod] = useState<Period>('day')
  const [chartTab, setChartTab] = useState<'kline' | 'macd' | 'rsi'>('kline')

  useEffect(() => {
    if (!code) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getStockDetail(code).catch(() => null),
      getResults().catch(() => ({ results: [] })),
      getStockSectors(code).catch(() => ({ sectors: [] })),
    ]).then(([dRes, rRes, sRes]) => {
      if (cancelled) return
      setDetail(dRes)
      setResults((rRes.results || []).filter((r: any) => r.stock_code === code))
      setStockSectors(sRes?.sectors || [])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [code])

  const latest = detail?.latest || {}
  const kd = detail?.kline || []
  const today = kd[kd.length - 1]
  const prev = kd[kd.length - 2]
  const isUp = today && today.pct_chg >= 0
  const pct = today?.pct_chg || 0
  const periodData = useMemo(() => aggregateKline(kd, chartPeriod), [kd, chartPeriod])

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  if (!detail || detail.error) return <Alert message="获取数据失败" type="error" showIcon />

  const chartOptions = {
    kline: mobileKlineOption(periodData, { showMa: chartPeriod === 'day' }),
    macd: mobileMacdOption(kd),
    rsi: mobileRsiOption(kd),
  }

  const statGrid = [
    ['今开', today?.open?.toFixed(2) ?? '-', ''],
    ['最高', today?.high?.toFixed(2) ?? '-', '#f5222d'],
    ['成交量', formatVol(today?.volume), ''],
    ['换手率', latest.turnover_rate ?? '-', ''],
    ['昨收', prev?.close?.toFixed(2) ?? '-', ''],
    ['最低', today?.low?.toFixed(2) ?? '-', '#52c41a'],
    ['成交额', formatMoney(today?.amount), ''],
    ['市盈(TTM)', latest.pe_ttm ?? '-', ''],
  ]

  return (
    <div style={{ padding: '4px 0' }}>
      <Button icon={<ArrowLeftOutlined />} size="small" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        返回
      </Button>

      {/* Hero card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: isUp
            ? 'linear-gradient(135deg, #fff1f0 0%, #ffffff 50%, #fff1f0 100%)'
            : 'linear-gradient(135deg, #f6ffed 0%, #ffffff 50%, #f6ffed 100%)',
          borderRadius: 16,
          padding: '16px 18px',
          marginBottom: 12,
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Tag color="blue" style={{ fontSize: 12, margin: 0 }}>{detail.market === 'SH' ? 'SH' : 'SZ'}</Tag>
          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: '#999' }}>{detail.code}</Text>
          <Text strong style={{ fontSize: 18 }}>{detail.name}</Text>
          {stockSectors.slice(0, 2).map((s: any) => (
            <Tag key={s.name} color="purple" style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}
              onClick={() => navigate(`/sector/${encodeURIComponent(s.name)}?type=${s.type}`)}>
              {s.name}
            </Tag>
          ))}
        </div>

        <div style={{ fontSize: 36, fontWeight: 700, color: isUp ? '#f5222d' : '#52c41a', marginBottom: 2 }}>
          {today?.close?.toFixed(2) ?? '-'}
          <span style={{ fontSize: 14, color: '#999', fontWeight: 400, marginLeft: 4 }}>元</span>
        </div>
        <div style={{ fontSize: 15, color: isUp ? '#f5222d' : '#52c41a', marginBottom: 12 }}>
          {isUp ? '+' : ''}{pct.toFixed(2)} ({isUp ? '+' : ''}{pct.toFixed(2)}%)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 4px' }}>
          {statGrid.map(([label, val, color]) => (
            <div key={label as string}>
              <div style={{ fontSize: 11, color: '#999' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: (color as string) || '#333' }}>
                {val}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
          总市值：{latest.market_cap ? formatMoney(latest.market_cap) : '-'}
        </div>
      </motion.div>

      {/* Chart period tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 8, overflow: 'auto' }}>
        {PERIODS.map((p) => (
          <div
            key={p.key}
            onClick={() => { setChartPeriod(p.key); setChartTab('kline') }}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
              flexShrink: 0,
              borderBottom: chartPeriod === p.key ? '2px solid #1677ff' : '2px solid transparent',
              color: chartPeriod === p.key ? '#1677ff' : '#999',
              fontWeight: chartPeriod === p.key ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {p.label}
          </div>
        ))}
      </div>

      {/* Chart tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
        {(['kline', 'macd', 'rsi'] as const).map((t) => (
          <div
            key={t}
            onClick={() => setChartTab(t)}
            style={{
              padding: '5px 14px',
              cursor: 'pointer',
              fontSize: 12,
              borderRadius: 14,
              marginRight: 6,
              background: chartTab === t ? '#1677ff' : '#f5f5f5',
              color: chartTab === t ? '#fff' : '#666',
              fontWeight: chartTab === t ? 500 : 400,
              transition: 'all 0.15s',
            }}
          >
            {t === 'kline' ? 'K线' : t.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Chart */}
      <motion.div
        key={chartTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="chart-box"
        style={{ padding: '8px 4px', marginBottom: 12, touchAction: 'pan-x pinch-zoom' }}
      >
        <ReactECharts
          option={chartOptions[chartTab]}
          style={{ height: chartTab === 'kline' ? 300 : 200 }}
          notMerge
        />
      </motion.div>

      {/* Strategy signals */}
      {results.length > 0 && (
        <div className="card-mobile" style={{ padding: 16 }}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 10 }}>策略信号</Text>
          {results.map((r: any) => (
            <div key={r.id} style={{
              background: r.score >= 80 ? 'linear-gradient(90deg, #fff1f0, #fff)' : '#fafafa',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8,
              border: '1px solid var(--color-border)',
            }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color="blue" style={{ fontSize: 11 }}>{r.strategy_name}</Tag>
                <Text strong style={{ color: r.score >= 80 ? '#f5222d' : '#fa8c16', fontSize: 13 }}>
                  评分: {r.score}
                </Text>
              </Space>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {r.reason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default StockDetail
