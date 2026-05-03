import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Row, Col, Tag, Typography, Spin, Descriptions, Alert,
  Space, Button, Modal,
} from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined, ArrowLeftOutlined,
  StockOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { getStockDetail, getResults, getStockSectors } from '../api'

const { Title, Text } = Typography

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
  const isWeek = period === 'week'
  const isMonth = period === 'month'
  const isQuarter = period === 'quarter'
  const isYear = period === 'year'

  for (const d of data) {
    const parts = d.date.split('-')
    const y = parts[0], m = parts[1], day = parseInt(parts[2])
    let key: string
    if (isWeek) {
      const dt = new Date(+y, +m - 1, day)
      const weekStart = new Date(dt)
      weekStart.setDate(dt.getDate() - dt.getDay() + 1)
      key = weekStart.toISOString().slice(0, 10)
    } else if (isMonth) {
      key = `${y}-${m}`
    } else if (isQuarter) {
      const q = Math.ceil(parseInt(m) / 3)
      key = `${y}-Q${q}`
    } else {
      key = y
    }
    if (!dateMap.has(key)) dateMap.set(key, [])
    dateMap.get(key)!.push(d)
  }

  const result: any[] = []
  for (const [, group] of dateMap) {
    if (group.length === 0) continue
    result.push({
      date: group[0].date,
      open: group[0].open,
      high: Math.max(...group.map((d: any) => d.high)),
      low: Math.min(...group.map((d: any) => d.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s: number, d: any) => s + d.volume, 0),
      MA5: null,
      MA10: null,
      MA20: null,
    })
  }
  return result
}

const StockDetail: React.FC = () => {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [results, setResults] = useState<any[]>([])
  const [chartPeriod, setChartPeriod] = useState<Period>('day')
  const [clickedDay, setClickedDay] = useState<any>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number>(-1)
  const [zoomRange, setZoomRange] = useState({ start: 75, end: 100 })
  const [stockSectors, setStockSectors] = useState<any[]>([])
  const loadedRef = useRef<string>('')
  const chartRef = useRef<any>(null)
  const klineDataRef = useRef<any[]>([])
  const periodDataRef = useRef<any[]>([])

  useEffect(() => {
    if (code && loadedRef.current !== code) {
      loadedRef.current = code
      loadData(code)
    }
  }, [code])

  const loadData = async (stockCode: string) => {
    setLoading(true)
    try {
      const [detailRes, resultsRes, sectorsRes] = await Promise.all([
        getStockDetail(stockCode).catch(() => null),
        getResults().catch(() => ({ results: [] })),
        getStockSectors(stockCode).catch(() => ({ sectors: [] })),
      ])
      setDetail(detailRes)
      setStockSectors(sectorsRes?.sectors || [])
      setResults(
        (resultsRes.results || []).filter((r: any) => r.stock_code === stockCode)
      )
    } catch (err) {
      console.error('加载个股数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const latest = detail?.latest || {}
  const klineData = detail?.kline || []
  const lastIdx = klineData.length - 1

  const displayIdx = selectedIdx >= 0 && selectedIdx < klineData.length ? selectedIdx : lastIdx
  const prevShowIdx = displayIdx > 0 ? displayIdx - 1 : -1
  const today = klineData[displayIdx]
  const prevClose = prevShowIdx >= 0 ? klineData[prevShowIdx]?.close : klineData[lastIdx - 1]?.close
  const isUp = today && today.pct_chg >= 0
  const pct = today?.pct_chg || 0

  const periodData = useMemo(() => aggregateKline(klineData, chartPeriod), [klineData, chartPeriod])
  klineDataRef.current = klineData
  periodDataRef.current = periodData

  const getKlineOption = () => {
    if (!periodData || periodData.length === 0) return {}
    const dates = periodData.map((d: any) => d.date)
    const ohlc = periodData.map((d: any) => [d.open, d.close, d.low, d.high])
    const volumes = periodData.map((d: any) => d.volume)
    const volColors = periodData.map((d: any) => d.close >= d.open ? '#cf1322' : '#389e0d')
    const ma5 = periodData.map((d: any) => d.MA5 ?? null)
    const ma10 = periodData.map((d: any) => d.MA10 ?? null)
    const ma20 = periodData.map((d: any) => d.MA20 ?? null)
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const d = periodData[params[0].dataIndex]
          if (!d) return ''
          const cl = d.close >= d.open ? '#cf1322' : '#389e0d'
          const arr = (d.pct_chg ?? 0) >= 0 ? '▲' : '▼'
          const pctStr = d.pct_chg != null ? `${d.pct_chg >= 0 ? '+' : ''}${d.pct_chg.toFixed(2)}%` : '-'
          const prev = periodData[params[0].dataIndex - 1]
          const chg = prev ? ` ${arr} ${((d.close - prev.close) / prev.close * 100).toFixed(2)}%` : ''
          return (
            `<div style="font-size:13px;line-height:1.8">` +
            `<b>${d.date}</b><br/>` +
            `<span style="color:${cl}">收盘 <b>${d.close.toFixed(2)}</b>${chg}</span><br/>` +
            `开 ${d.open.toFixed(2)}　高 ${d.high.toFixed(2)}<br/>` +
            `低 ${d.low.toFixed(2)}　量 ${formatVol(d.volume)}` +
            (d.MA5 ? `<br/><span style="color:#f5222d">MA5 ${d.MA5.toFixed(2)}</span>` : '') +
            (d.MA10 ? `　<span style="color:#fa8c16">MA10 ${d.MA10.toFixed(2)}</span>` : '') +
            (d.MA20 ? `　<span style="color:#722ed1">MA20 ${d.MA20.toFixed(2)}</span>` : '') +
            `</div>`
          )
        },
      },
      legend: { data: ['K线', 'MA5', 'MA10', 'MA20'], top: 0 },
      grid: [
        { left: '5%', right: '5%', top: '10%', height: '55%' },
        { left: '5%', right: '5%', top: '72%', height: '20%' },
      ],
      xAxis: [
        { type: 'category', data: dates, axisLine: { onZero: false }, axisTick: { show: false }, gridIndex: 0 },
        { type: 'category', data: dates, gridIndex: 1, axisTick: { show: false }, axisLabel: { show: false } },
      ],
      yAxis: [
        { type: 'value', scale: true, gridIndex: 0 },
        { type: 'value', scale: true, gridIndex: 1 },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: zoomRange.start, end: zoomRange.end },
        { show: true, type: 'slider', xAxisIndex: [0, 1], start: zoomRange.start, end: zoomRange.end, bottom: 0 },
      ],
      series: [
        {
          name: 'K线', type: 'candlestick', data: ohlc,
          itemStyle: { color: '#cf1322', color0: '#389e0d', borderColor: '#cf1322', borderColor0: '#389e0d' },
          xAxisIndex: 0, yAxisIndex: 0,
        },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#f5222d' }, xAxisIndex: 0, yAxisIndex: 0 },
        { name: 'MA10', type: 'line', data: ma10, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#fa8c16' }, xAxisIndex: 0, yAxisIndex: 0 },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#722ed1' }, xAxisIndex: 0, yAxisIndex: 0 },
        {
          name: '成交量', type: 'bar', data: volumes,
          xAxisIndex: 1, yAxisIndex: 1,
          itemStyle: { color: (p: any) => volColors[p.dataIndex] },
        },
      ],
    }
  }

  const getMacdOption = () => {
    if (!klineData || klineData.length === 0) return {}
    const data = klineData
    const dates = data.map((d: any) => d.date)
    const dif = data.map((d: any) => d.DIF ?? null)
    const dea = data.map((d: any) => d.DEA ?? null)
    const macd = data.map((d: any) => d.MACD ?? null)
    const macdColors = data.map((d: any) => (d.MACD ?? 0) >= 0 ? '#cf1322' : '#389e0d')
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const d = data[params[0].dataIndex]
          if (!d) return ''
          const mv = d.MACD ?? 0
          return `<div style="font-size:13px;line-height:1.8"><b>${d.date}</b><br/>` +
            `<span style="color:#1677ff">DIF ${(d.DIF ?? 0).toFixed(4)}</span><br/>` +
            `<span style="color:#fa8c16">DEA ${(d.DEA ?? 0).toFixed(4)}</span><br/>` +
            `<span style="color:${mv >= 0 ? '#cf1322' : '#389e0d'}">MACD ${mv.toFixed(4)}</span></div>`
        },
      },
      grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
      xAxis: { type: 'category', data: dates, axisLabel: { show: false } },
      yAxis: { type: 'value', scale: true },
      series: [
        { name: 'DIF', type: 'line', data: dif, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#1677ff' } },
        { name: 'DEA', type: 'line', data: dea, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#fa8c16' } },
        { name: 'MACD', type: 'bar', data: macd, itemStyle: { color: (p: any) => macdColors[p.dataIndex] } },
      ],
    }
  }

  const getRsiOption = () => {
    if (!klineData || klineData.length === 0) return {}
    const data = klineData
    const dates = data.map((d: any) => d.date)
    const rsi = data.map((d: any) => d.RSI ?? null)
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const d = data[params[0].dataIndex]
          if (!d) return ''
          const rv = d.RSI ?? 0
          let status = '正常', sc = '#1677ff'
          if (rv >= 70) { status = '⚠ 超买'; sc = '#cf1322' }
          else if (rv <= 30) { status = '💡 超卖'; sc = '#389e0d' }
          return `<div style="font-size:13px;line-height:1.8"><b>${d.date}</b><br/>` +
            `<span style="color:${sc}">RSI ${rv.toFixed(2)} ${status}</span></div>`
        },
      },
      grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
      xAxis: { type: 'category', data: dates, axisLabel: { show: false } },
      yAxis: { type: 'value', min: 0, max: 100 },
      series: [
        {
          name: 'RSI', type: 'line', data: rsi, smooth: true, symbol: 'none',
          lineStyle: { width: 2, color: '#722ed1' },
          areaStyle: { color: 'rgba(114,46,209,0.08)' },
          markLine: {
            silent: true,
            data: [
              { yAxis: 70, label: { formatter: '超买' }, lineStyle: { color: '#cf1322', type: 'dashed' } },
              { yAxis: 30, label: { formatter: '超卖' }, lineStyle: { color: '#389e0d', type: 'dashed' } },
            ],
          },
        },
      ],
    }
  }

  const onChartReady = (instance: any) => {
    chartRef.current = instance
    instance.getZr().on('click', (event: any) => {
      const idx = [0, 1].find((i) => {
        try {
          const p = instance.convertFromPixel({ seriesIndex: i }, [event.offsetX, event.offsetY])
          return p && Array.isArray(p) && p[0] != null && !isNaN(p[0])
        } catch { return false }
      })
      if (idx == null) return
      const p = instance.convertFromPixel({ seriesIndex: idx }, [event.offsetX, event.offsetY])
      const dataIndex = Math.round(p[0])
      const pd = periodDataRef.current
      if (dataIndex >= 0 && dataIndex < pd.length) {
        const d = pd[dataIndex]
        const kd = klineDataRef.current
        const kIdx = kd.findIndex((k: any) => k.date === d.date)
        if (kIdx >= 0) setSelectedIdx(kIdx)
      }
    })
  }

  const onKlineClick = (params: any) => {
    if (params?.componentType === 'series' && params.dataIndex != null) {
      const d = periodData[params.dataIndex]
      if (d) {
        setClickedDay(d)
        setDetailModalOpen(true)
      }
    }
  }

  const resetSelected = () => {
    setSelectedIdx(-1)
    setClickedDay(null)
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  if (!detail || detail.error) {
    return <Alert message="获取数据失败" description={detail?.error || '未知错误'} type="error" showIcon />
  }

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        返回
      </Button>

      {/* === 百度风格顶部 === */}
      <div style={{ background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16 }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
          <Col>
            <Tag color="blue" style={{ marginRight: 8, fontSize: 13, padding: '0 8px' }}>
              {detail.market === 'SH' ? 'SH' : detail.market === 'SZ' ? 'SZ' : detail.market}
            </Tag>
            <Text style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 500 }}>{detail.code}</Text>
            <Text strong style={{ fontSize: 18, marginLeft: 10 }}>{detail.name}</Text>
            {detail.industry && <Tag style={{ marginLeft: 8 }}>{detail.industry}</Tag>}
            {stockSectors.slice(0, 3).map((s: any) => (
              <Tag key={s.name} color="purple" style={{ marginLeft: 4, cursor: 'pointer', fontSize: 12 }}
                onClick={(e) => { e.stopPropagation(); navigate(`/sector/${encodeURIComponent(s.name)}?type=${s.type}`) }}
              >
                {s.name}
              </Tag>
            ))}
          </Col>
          <Col>
            {selectedIdx >= 0 ? (
              <Space>
                <Tag color="processing">{today?.date}</Tag>
                <Button size="small" type="link" onClick={resetSelected} style={{ fontSize: 12 }}>
                  恢复最新
                </Button>
              </Space>
            ) : (
              <Tag color="default">最新</Tag>
            )}
          </Col>
        </Row>

        <div style={{ color: '#999', fontSize: 13, marginBottom: 12 }} />

        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: isUp ? '#cf1322' : '#389e0d' }}>
            {today?.close?.toFixed(2) ?? '-'}
          </span>
          <span style={{ fontSize: 14, color: '#999', marginLeft: 4 }}>元</span>
        </div>
        <div style={{ fontSize: 16, color: isUp ? '#cf1322' : '#389e0d', marginBottom: 8 }}>
          {isUp ? '+' : ''}{pct.toFixed(2)}
          <span style={{ marginLeft: 8 }}>
            {isUp ? '+' : ''}{pct.toFixed(2)}%
          </span>
        </div>

        <div style={{ color: '#999', fontSize: 13, marginBottom: 16 }} />

        {/* 2x4 数据网格 */}
        <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
          <Col xs={12} sm={6}>
            <div style={statLabel}>今开</div>
            <div style={statVal}>{today?.open?.toFixed(2) ?? '-'}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>最高</div>
            <div style={{ ...statVal, color: '#cf1322' }}>{today?.high?.toFixed(2) ?? '-'}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>成交量</div>
            <div style={statVal}>{formatVol(today?.volume)}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>换手率</div>
            <div style={statVal}>{latest.turnover_rate ?? '-'}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>昨收</div>
            <div style={statVal}>{prevClose?.toFixed(2) ?? '-'}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>最低</div>
            <div style={{ ...statVal, color: '#389e0d' }}>{today?.low?.toFixed(2) ?? '-'}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>成交额</div>
            <div style={statVal}>{formatMoney(today?.amount)}</div>
          </Col>
          <Col xs={12} sm={6}>
            <div style={statLabel}>市盈(TTM)</div>
            <div style={statVal}>{latest.pe_ttm ?? '-'}</div>
          </Col>
        </Row>

        {/* 总市值 */}
        <div style={{ color: '#666', fontSize: 13 }}>
          总市值：{latest.market_cap ? formatMoney(latest.market_cap) : '-'}
        </div>
      </div>

      {/* === 周期切换 + K线图 === */}
      <div style={{ background: '#fff', borderRadius: 8, padding: '16px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
          {PERIODS.map((p) => (
            <div
              key={p.key}
              onClick={() => { setChartPeriod(p.key); resetSelected(); setZoomRange({ start: 0, end: 100 }) }}
              style={{
                padding: '6px 16px',
                cursor: 'pointer',
                fontSize: 14,
                borderBottom: chartPeriod === p.key ? '2px solid #1677ff' : '2px solid transparent',
                color: chartPeriod === p.key ? '#1677ff' : '#666',
                fontWeight: chartPeriod === p.key ? 600 : 400,
              }}
            >
              {p.label}
            </div>
          ))}
        </div>
        <ReactECharts
          option={getKlineOption()}
          style={{ height: Math.max(300, Math.min(400, window.innerHeight * 0.4)) }}
          onChartReady={onChartReady}
          onEvents={{
            click: onKlineClick,
            dataZoom: (params: any) => {
              if (params.batch?.[0]) {
                setZoomRange({ start: params.batch[0].start, end: params.batch[0].end })
              } else if (params.start != null) {
                setZoomRange({ start: params.start, end: params.end })
              }
            },
          }}
        />
      </div>

      {/* === MACD + RSI 并列 === */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '8px 0' }}>
            <div style={{ fontSize: 13, color: '#666', padding: '4px 16px' }}>MACD</div>
            <ReactECharts option={getMacdOption()} style={{ height: 200 }} notMerge />
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '8px 0' }}>
            <div style={{ fontSize: 13, color: '#666', padding: '4px 16px' }}>RSI</div>
            <ReactECharts option={getRsiOption()} style={{ height: 200 }} notMerge />
          </div>
        </Col>
      </Row>

      {/* === 策略信号 === */}
      {results.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>策略信号</div>
          {results.map((r: any) => (
            <div key={r.id} style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, marginBottom: 8 }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color="blue">{r.strategy_name}</Tag>
                <Text strong style={{ color: r.score >= 80 ? '#cf1322' : '#fa8c16' }}>评分: {r.score}</Text>
              </Space>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 13, color: '#555' }}>
                {r.reason}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* === 日K详情弹窗 === */}
      <Modal
        title={<Space><StockOutlined />{detail.name} ({detail.code}) <Text type="secondary">{clickedDay?.date}</Text></Space>}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={520}
      >
        {clickedDay && (
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="开盘价"><Text strong>{clickedDay.open.toFixed(2)}</Text></Descriptions.Item>
                <Descriptions.Item label="最高价"><Text strong style={{ color: '#cf1322' }}>{clickedDay.high.toFixed(2)}</Text></Descriptions.Item>
                <Descriptions.Item label="最低价"><Text strong style={{ color: '#389e0d' }}>{clickedDay.low.toFixed(2)}</Text></Descriptions.Item>
                <Descriptions.Item label="收盘价"><Text strong style={{ color: clickedDay.close >= clickedDay.open ? '#cf1322' : '#389e0d', fontSize: 16 }}>{clickedDay.close.toFixed(2)}</Text></Descriptions.Item>
                <Descriptions.Item label="涨跌幅"><Text strong style={{ color: clickedDay.pct_chg >= 0 ? '#cf1322' : '#389e0d' }}>{clickedDay.pct_chg >= 0 ? '+' : ''}{clickedDay.pct_chg.toFixed(2)}% {clickedDay.pct_chg >= 0 ? '↑' : '↓'}</Text></Descriptions.Item>
                <Descriptions.Item label="成交量">{formatVol(clickedDay.volume)} 股</Descriptions.Item>
              </Descriptions>
            </Col>
            <Col span={12}>
              <Descriptions column={1} size="small" bordered>
                {clickedDay.MA5 != null && <Descriptions.Item label="MA5"><span style={{ color: '#f5222d' }}>{clickedDay.MA5.toFixed(2)}</span></Descriptions.Item>}
                {clickedDay.MA10 != null && <Descriptions.Item label="MA10"><span style={{ color: '#fa8c16' }}>{clickedDay.MA10.toFixed(2)}</span></Descriptions.Item>}
                {clickedDay.MA20 != null && <Descriptions.Item label="MA20"><span style={{ color: '#722ed1' }}>{clickedDay.MA20.toFixed(2)}</span></Descriptions.Item>}
                {clickedDay.DIF != null && <Descriptions.Item label="DIF">{clickedDay.DIF.toFixed(4)}</Descriptions.Item>}
                {clickedDay.DEA != null && <Descriptions.Item label="DEA">{clickedDay.DEA.toFixed(4)}</Descriptions.Item>}
                {clickedDay.MACD != null && <Descriptions.Item label="MACD"><Text style={{ color: clickedDay.MACD >= 0 ? '#cf1322' : '#389e0d' }}>{clickedDay.MACD.toFixed(4)}</Text></Descriptions.Item>}
                {clickedDay.RSI != null && <Descriptions.Item label="RSI(14)"><Text style={{ color: clickedDay.RSI >= 70 ? '#cf1322' : clickedDay.RSI <= 30 ? '#389e0d' : '#1677ff' }}>{clickedDay.RSI.toFixed(2)}{clickedDay.RSI >= 70 ? ' 超买' : clickedDay.RSI <= 30 ? ' 超卖' : ''}</Text></Descriptions.Item>}
                {clickedDay.K != null && <Descriptions.Item label="K值">{clickedDay.K.toFixed(2)}</Descriptions.Item>}
                {clickedDay.D != null && <Descriptions.Item label="D值">{clickedDay.D.toFixed(2)}</Descriptions.Item>}
                {clickedDay.J != null && <Descriptions.Item label="J值">{clickedDay.J.toFixed(2)}</Descriptions.Item>}
                {clickedDay.BB_UPPER != null && <Descriptions.Item label="布林上轨"><Text style={{ color: '#cf1322' }}>{clickedDay.BB_UPPER.toFixed(2)}</Text></Descriptions.Item>}
                {clickedDay.BB_LOWER != null && <Descriptions.Item label="布林下轨"><Text style={{ color: '#389e0d' }}>{clickedDay.BB_LOWER.toFixed(2)}</Text></Descriptions.Item>}
              </Descriptions>
            </Col>
          </Row>
        )}
      </Modal>
    </div>
  )
}

const statLabel: React.CSSProperties = { fontSize: 12, color: '#999', marginBottom: 2 }
const statVal: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#333' }

export default StockDetail
