import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Typography, Tag, Spin, Alert, Space, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import { getStockDetail, getResults, getStockSectors } from '../api'
import { mobileKlineOption } from '../utils/echartsTheme'

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

  const chartRef = useRef<any>(null)
  const periodDataRef = useRef<any[]>([])
  const [crosshairIdx, setCrosshairIdx] = useState(-1)
  const visibleHighLowRef = useRef<{ highIdx: number; highVal: number; lowIdx: number; lowVal: number } | null>(null)
  const dataZoomRangeRef = useRef({ start: 75, end: 100 })

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
  periodDataRef.current = periodData

  useEffect(() => { setCrosshairIdx(-1) }, [chartPeriod])

  const chartReadyHandler = useCallback((echarts: any) => {
    chartRef.current = echarts

    /* Card follow: update when tooltip shows/hides */
    echarts.on('showTip', (params: any) => {
      if (params.dataIndex != null) setCrosshairIdx(params.dataIndex)
    })
    echarts.on('hideTip', () => setCrosshairIdx(-1))

    /* Auto-dismiss crosshair when user pans/zooms so chart is freely draggable */
    echarts.on('dataZoom', () => {
      if (chartRef.current) chartRef.current.dispatchAction({ type: 'hideTip', seriesIndex: 0 })
    })

    /* Visible high/low markers (on each dataZoom change) */
    const updateVisibleRange = () => {
      const data = periodDataRef.current
      if (!data.length) return
      const opt = echarts.getOption()
      const dz = opt.dataZoom?.[0]
      if (dz) dataZoomRangeRef.current = { start: dz.start ?? 75, end: dz.end ?? 100 }
      const total = data.length
      const startIdx = Math.floor(total * dataZoomRangeRef.current.start / 100)
      const endIdx = Math.min(total - 1, Math.ceil(total * dataZoomRangeRef.current.end / 100) - 1)
      if (startIdx > endIdx || endIdx < 0) return
      let highIdx = startIdx, lowIdx = startIdx
      for (let i = startIdx; i <= endIdx; i++) {
        if (data[i].high > data[highIdx].high) highIdx = i
        if (data[i].low < data[lowIdx].low) lowIdx = i
      }
      const hv = data[highIdx].high, lv = data[lowIdx].low
      visibleHighLowRef.current = { highIdx, highVal: hv, lowIdx, lowVal: lv }
      chartRef.current?.setOption({
        series: [{
          markPoint: {
            silent: true, symbol: 'none', label: { show: true, fontSize: 11 },
            data: [
              { name: `${hv.toFixed(2)} →`, coord: [highIdx, hv], label: { formatter: `${hv.toFixed(2)} →`, position: 'top', distance: 3, color: '#f5222d', fontWeight: 600 } },
              { name: `← ${lv.toFixed(2)}`, coord: [lowIdx, lv], label: { formatter: `← ${lv.toFixed(2)}`, position: 'bottom', distance: 3, color: '#52c41a', fontWeight: 600 } },
            ],
          },
        }],
      })
    }
    updateVisibleRange()
    echarts.on('dataZoom', updateVisibleRange)
  }, [])

  const chartOption = useMemo(() => {
    const opt = mobileKlineOption(periodData, {
      showMa: chartPeriod === 'day',
      visibleHighLow: visibleHighLowRef.current,
    })
    if (opt.dataZoom) {
      const dz = dataZoomRangeRef.current
      opt.dataZoom = opt.dataZoom.map((d: any) => ({
        ...d,
        start: dz.start,
        end: dz.end,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
        zoomOnMouseWheel: true,
      }))
    }
    return opt
  }, [periodData, chartPeriod])

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  if (!detail || detail.error) return <Alert message="获取数据失败" type="error" showIcon />

  const crosshairItem = crosshairIdx >= 0 && crosshairIdx < periodData.length ? periodData[crosshairIdx] : null
  const crosshairPrev = crosshairIdx > 0 ? periodData[crosshairIdx - 1] : null
  const displayToday = crosshairItem || today
  const displayPrev = crosshairItem ? crosshairPrev : prev
  const displayIsUp = crosshairItem
    ? (crosshairItem.pct_chg ?? ((crosshairItem.close - (crosshairPrev?.close ?? crosshairItem.close)) / (crosshairPrev?.close || crosshairItem.close) * 100)) >= 0
    : isUp
  const displayPct = crosshairItem
    ? (crosshairItem.pct_chg ?? (crosshairPrev ? ((crosshairItem.close - crosshairPrev.close) / crosshairPrev.close * 100) : 0))
    : pct
  const displayDate = crosshairItem?.date ?? today?.date

  const displayItem = crosshairItem || today
  const maValues = chartPeriod === 'day' ? {
    ma5: displayItem?.MA5,
    ma10: displayItem?.MA10,
    ma20: displayItem?.MA20,
  } : null

  const statGrid = [
    ['今开', displayToday?.open?.toFixed(2) ?? '-', ''],
    ['最高', displayToday?.high?.toFixed(2) ?? '-', '#f5222d'],
    ['成交量', formatVol(displayToday?.volume), ''],
    ['换手率', crosshairItem ? '-' : (latest.turnover_rate ?? '-'), ''],
    ['昨收', displayPrev?.close?.toFixed(2) ?? '-', ''],
    ['最低', displayToday?.low?.toFixed(2) ?? '-', '#52c41a'],
    ['成交额', crosshairItem ? (displayToday?.amount ? formatMoney(displayToday.amount) : '-') : formatMoney(today?.amount), ''],
    ['市盈(TTM)', crosshairItem ? '-' : (latest.pe_ttm ?? '-'), ''],
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
          background: displayIsUp
            ? 'linear-gradient(135deg, #fff1f0 0%, #ffffff 50%, #fff1f0 100%)'
            : 'linear-gradient(135deg, #f6ffed 0%, #ffffff 50%, #f6ffed 100%)',
          borderRadius: 16,
          padding: '16px 18px',
          marginBottom: 12,
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Tag color="blue" style={{ fontSize: 12, margin: 0 }}>{detail.market === 'SH' ? 'SH' : 'SZ'}</Tag>
          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: '#999' }}>{detail.code}</Text>
          <Text strong style={{ fontSize: 18 }}>{detail.name}</Text>
          <div style={{ flex: 1 }} />
          {crosshairItem && (
            <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>{displayDate}</Tag>
          )}
        </div>
        {stockSectors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {stockSectors.slice(0, 6).map((s: any) => (
              <Tag key={s.name} color="purple" style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}
                onClick={() => navigate(`/sector/${encodeURIComponent(s.name)}?type=${s.type}`)}>
                {s.name}
              </Tag>
            ))}
          </div>
        )}

        <div style={{ fontSize: 36, fontWeight: 700, color: displayIsUp ? '#f5222d' : '#52c41a', marginBottom: 2 }}>
          {displayToday?.close?.toFixed(2) ?? '-'}
          <span style={{ fontSize: 14, color: '#999', fontWeight: 400, marginLeft: 4 }}>元</span>
        </div>
        <div style={{ fontSize: 15, color: displayIsUp ? '#f5222d' : '#52c41a', marginBottom: 12 }}>
          {displayIsUp ? '+' : ''}{displayPct.toFixed(2)} ({displayIsUp ? '+' : ''}{displayPct.toFixed(2)}%)
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
            onClick={() => { setChartPeriod(p.key) }}
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

      {/* Chart */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        {maValues && (
          <div style={{
            position: 'absolute', top: 4, right: 8, zIndex: 10,
            display: 'flex', gap: 8, fontSize: 10, fontWeight: 500,
            background: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '2px 6px',
            pointerEvents: 'none',
          }}>
            <span style={{ color: '#f5222d' }}>MA5: {maValues.ma5?.toFixed(2) ?? '-'}</span>
            <span style={{ color: '#fa8c16' }}>MA10: {maValues.ma10?.toFixed(2) ?? '-'}</span>
            <span style={{ color: '#722ed1' }}>MA20: {maValues.ma20?.toFixed(2) ?? '-'}</span>
          </div>
        )}
        <ReactECharts
          option={chartOption}
          style={{ height: 300, touchAction: 'none' }}
          onChartReady={chartReadyHandler}
        />
      </div>

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
