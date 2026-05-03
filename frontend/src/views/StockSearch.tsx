import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Input, Spin, Typography, Space, Tag, Empty, Row, Col, Button, Alert, Tooltip,
} from 'antd'
import {
  SearchOutlined, HistoryOutlined, CloseOutlined, FullscreenOutlined, FullscreenExitOutlined, DeleteOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { searchStocks, saveSearchKeyword, getSearchHistory, getStockDetail, deleteSearchHistory, deleteSearchKeyword } from '../api'

const { Text } = Typography
const { Title } = Typography

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
    })
  }
  return result
}

function formatVol(v: number) {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return v.toFixed(0)
}

const StockSearch: React.FC = () => {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [stockDetail, setStockDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [chartPeriod, setChartPeriod] = useState<Period>('day')
  const [zoomRange, setZoomRange] = useState({ start: 75, end: 100 })
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const res = await getSearchHistory()
      setHistory(res.keywords || [])
    } catch {}
  }

  const doSearch = async (kw: string) => {
    if (!kw.trim()) return
    setLoading(true)
    try {
      const res = await searchStocks(kw)
      setResults(res.stocks || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const saveKeyword = async (kw: string) => {
    try {
      await saveSearchKeyword(kw)
      loadHistory()
    } catch {}
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!keyword.trim()) {
      setResults([])
      return
    }
    timer.current = setTimeout(() => doSearch(keyword.trim()), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [keyword])

  const handleSearch = (kw?: string) => {
    const k = (kw || keyword).trim()
    if (!k) return
    doSearch(k)
    saveKeyword(k)
  }

  const handleClickStock = (code: string) => {
    setSelectedCode(code === selectedCode ? null : code)
    if (keyword.trim()) saveKeyword(keyword.trim())
  }

  useEffect(() => {
    if (!selectedCode) return
    setDetailLoading(true)
    setStockDetail(null)
    getStockDetail(selectedCode).then((res) => {
      setStockDetail(res)
    }).catch(() => {}).finally(() => setDetailLoading(false))
  }, [selectedCode])

  const handleHistoryTag = (kw: string) => {
    setKeyword(kw)
    setSelectedCode(null)
    setStockDetail(null)
  }

  const periodData = useMemo(() => aggregateKline(stockDetail?.kline || [], chartPeriod), [stockDetail?.kline, chartPeriod])

  const klineOption = () => {
    if (!periodData || periodData.length === 0) return {}
    const data = periodData
    const dates = data.map((d: any) => d.date)
    const ohlc = data.map((d: any) => [d.open, d.close, d.low, d.high])
    const volumes = data.map((d: any) => d.volume)
    const volColors = data.map((d: any) => d.close >= d.open ? '#cf1322' : '#389e0d')
    const ma5 = data.map((d: any) => d.MA5 ?? null)
    const ma10 = data.map((d: any) => d.MA10 ?? null)
    const ma20 = data.map((d: any) => d.MA20 ?? null)
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const d = data[params[0].dataIndex]
          if (!d) return ''
          const up = d.close >= d.open
          const c = up ? '#cf1322' : '#389e0d'
          return `<div style="font-size:13px;line-height:1.8"><b>${d.date}</b><br/>` +
            `<span style="color:${c}">收盘 <b>${d.close.toFixed(2)}</b> ${d.pct_chg >= 0 ? '▲' : '▼'} ${d.pct_chg >= 0 ? '+' : ''}${d.pct_chg.toFixed(2)}%</span><br/>` +
            `开 ${d.open.toFixed(2)} 高 ${d.high.toFixed(2)} 低 ${d.low.toFixed(2)} 量 ${formatVol(d.volume)}</div>`
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: zoomRange.start, end: zoomRange.end },
        { show: true, type: 'slider', xAxisIndex: [0, 1], start: zoomRange.start, end: zoomRange.end, bottom: 0 },
      ],
      grid: [{ left: '3%', right: '3%', top: '8%', height: fullScreen ? '58%' : '54%' }, { left: '3%', right: '3%', top: fullScreen ? '72%' : '70%', height: fullScreen ? '18%' : '20%' }],
      xAxis: [
        { type: 'category', data: dates, axisLine: { onZero: false }, axisTick: { show: false }, gridIndex: 0 },
        { type: 'category', data: dates, gridIndex: 1, axisTick: { show: false }, axisLabel: { show: false } },
      ],
      yAxis: [{ type: 'value', scale: true, gridIndex: 0 }, { type: 'value', scale: true, gridIndex: 1 }],
      legend: { data: ['K线', 'MA5', 'MA10', 'MA20'], top: 0 },
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

  const macdOption = () => {
    if (!stockDetail?.kline || stockDetail.kline.length === 0) return {}
    const data = stockDetail.kline
    const dates = data.map((d: any) => d.date)
    const dif = data.map((d: any) => d.DIF ?? null)
    const dea = data.map((d: any) => d.DEA ?? null)
    const macd = data.map((d: any) => d.MACD ?? null)
    const macdColors = data.map((d: any) => (d.MACD ?? 0) >= 0 ? '#cf1322' : '#389e0d')
    return {
      grid: { left: '3%', right: '3%', top: '12%', bottom: '10%' },
      xAxis: { type: 'category', data: dates, axisLabel: { show: false } },
      yAxis: { type: 'value', scale: true },
      series: [
        { name: 'DIF', type: 'line', data: dif, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#1677ff' } },
        { name: 'DEA', type: 'line', data: dea, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#fa8c16' } },
        { name: 'MACD', type: 'bar', data: macd, itemStyle: { color: (p: any) => macdColors[p.dataIndex] } },
      ],
    }
  }

  const rsiOption = () => {
    if (!stockDetail?.kline || stockDetail.kline.length === 0) return {}
    const data = stockDetail.kline
    const dates = data.map((d: any) => d.date)
    const rsi = data.map((d: any) => d.RSI ?? null)
    return {
      grid: { left: '3%', right: '3%', top: '12%', bottom: '10%' },
      xAxis: { type: 'category', data: dates, axisLabel: { show: false } },
      yAxis: { type: 'value', min: 0, max: 100 },
      series: [
        {
          name: 'RSI', type: 'line', data: rsi, smooth: true, symbol: 'none',
          lineStyle: { width: 2, color: '#722ed1' },
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

  const latest = stockDetail?.latest || {}
  const kd = stockDetail?.kline || []
  const today = kd[kd.length - 1]
  const isUp = today && today.pct_chg >= 0

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 16 }}>股票搜索</Text>
      </div>

      <Input
        size="large"
        placeholder="输入股票代码或名称搜索"
        prefix={<SearchOutlined style={{ color: '#999' }} />}
        value={keyword}
        onChange={(e) => { setKeyword(e.target.value); setSelectedCode(null); setStockDetail(null) }}
        onPressEnter={() => handleSearch()}
        style={{ marginBottom: 12, borderRadius: 8 }}
        allowClear
        autoFocus
      />

      {/* 搜索历史 */}
      {!keyword.trim() && history.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Space style={{ marginBottom: 6 }}>
            <HistoryOutlined style={{ color: '#999' }} />
            <Text type="secondary" style={{ fontSize: 13 }}>最近搜索</Text>
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={async () => {
                await deleteSearchHistory()
                loadHistory()
              }}
              style={{ fontSize: 12, padding: 0 }}
            >
              清空记录
            </Button>
          </Space>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {history.map((kw) => (
              <div
                key={kw}
                className="history-tag"
                style={{ position: 'relative', display: 'inline-block' }}
              >
                <Tag
                  style={{
                    cursor: 'pointer', margin: 0, fontSize: 13,
                    paddingRight: 20,
                  }}
                  onClick={() => handleHistoryTag(kw)}
                >
                  {kw}
                </Tag>
                <CloseOutlined
                  className="history-tag-del"
                  style={{
                    position: 'absolute', top: -2, right: 2, fontSize: 10,
                    cursor: 'pointer', color: '#999', zIndex: 1,
                    display: 'none',
                  }}
                  onClick={async (e) => {
                    e.stopPropagation()
                    await deleteSearchKeyword(kw)
                    loadHistory()
                  }}
                />
              </div>
            ))}
          </div>
          <style>{`
            .history-tag:hover .history-tag-del { display: inline-block !important; }
          `}</style>
        </div>
      )}

      {/* 搜索结果显示区域 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
        {/* 搜索结果列表（全屏时隐藏） */}
        {!fullScreen && (
          <div style={{
            flex: selectedCode ? '0 0 340px' : '1',
            maxWidth: selectedCode ? (window.innerWidth < 768 ? '100%' : 340) : 'none',
            width: window.innerWidth < 768 ? '100%' : 'auto',
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : results.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.map((s: any) => (
                  <div
                    key={s.code}
                    onClick={() => handleClickStock(s.code)}
                    style={{
                      background: selectedCode === s.code ? '#e6f4ff' : '#fff',
                      borderRadius: 8,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      border: selectedCode === s.code ? '1px solid #91caff' : '1px solid #f0f0f0',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Space style={{ marginBottom: 2 }}>
                      <Tag color={s.market === 'SH' ? 'blue' : s.market === 'SZ' ? 'green' : 'orange'} style={{ fontSize: 11, margin: 0 }}>
                        {s.market}
                      </Tag>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>{s.code}</Text>
                    </Space>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
                    {s.close != null && (
                      <Text style={{ fontSize: 13, fontWeight: 600, color: s.pct_chg >= 0 ? '#cf1322' : '#389e0d' }}>
                        {s.close.toFixed(2)}
                        <span style={{ marginLeft: 4 }}>{s.pct_chg >= 0 ? '+' : ''}{s.pct_chg?.toFixed(2)}%</span>
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            ) : keyword.trim() ? (
              <Empty description="未找到匹配的股票" />
            ) : null}
          </div>
        )}

        {/* 选中股票详情 */}
        {selectedCode && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
            ) : stockDetail ? (
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 16 }}>
                {/* 标题栏 */}
                <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                  <Col>
                    <Space>
                      <Tag color="blue" style={{ fontSize: 12 }}>{stockDetail.market === 'SH' ? 'SH' : 'SZ'}</Tag>
                      <Text style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 500 }}>{stockDetail.code}</Text>
                      <Text strong style={{ fontSize: 16 }}>{stockDetail.name}</Text>
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <Button size="small" icon={<FullscreenOutlined />} onClick={() => setFullScreen(true)} />
                      <Button size="small" icon={<CloseOutlined />} onClick={() => { setSelectedCode(null); setStockDetail(null); setFullScreen(false) }} />
                    </Space>
                  </Col>
                </Row>

                {/* 价格 + 统计 */}
                <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
                  <Col>
                    <div style={{ fontSize: 28, fontWeight: 700, color: isUp ? '#cf1322' : '#389e0d' }}>
                      {today?.close?.toFixed(2) ?? '-'}
                      <span style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>元</span>
                    </div>
                    <div style={{ fontSize: 14, color: isUp ? '#cf1322' : '#389e0d' }}>
                      {isUp ? '+' : ''}{today?.pct_chg?.toFixed(2) ?? '0.00'}%
                    </div>
                  </Col>
                  <Col flex="auto">
                    <Row gutter={[8, 4]}>
                      {[['今开', today?.open], ['最高', today?.high], ['最低', today?.low], ['昨收', kd[kd.length - 2]?.close], ['成交量', formatVol(today?.volume)]].map(([label, val]) => (
                        <Col span={8} key={label as string}>
                          <div style={{ fontSize: 11, color: '#999' }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{val != null ? (typeof val === 'number' ? val.toFixed(2) : val) : '-'}</div>
                        </Col>
                      ))}
                    </Row>
                  </Col>
                </Row>

                {/* 周期切换 */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                  {PERIODS.map((p) => (
                    <div
                      key={p.key}
                      onClick={() => { setChartPeriod(p.key); setZoomRange({ start: 0, end: 100 }) }}
                      style={{
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        borderBottom: chartPeriod === p.key ? '2px solid #1677ff' : '2px solid transparent',
                        color: chartPeriod === p.key ? '#1677ff' : '#666',
                        fontWeight: chartPeriod === p.key ? 600 : 400,
                      }}
                    >
                      {p.label}
                    </div>
                  ))}
                </div>
                {/* K 线图 */}
                <ReactECharts
                  option={klineOption()}
                  style={{ height: fullScreen ? Math.min(360, window.innerHeight * 0.35) : Math.min(200, window.innerHeight * 0.25) }}
                  onEvents={{
                    dataZoom: (params: any) => {
                      if (params.batch?.[0]) {
                        setZoomRange({ start: params.batch[0].start, end: params.batch[0].end })
                      } else if (params.start != null) {
                        setZoomRange({ start: params.start, end: params.end })
                      }
                    },
                  }}
                />

                {/* 全屏模式：MACD + RSI + 更多指标 */}
                {fullScreen && (
                  <>
                    <Row gutter={12} style={{ marginTop: 12 }}>
                      <Col xs={24} sm={12}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>MACD</div>
                        <ReactECharts option={macdOption()} style={{ height: 180 }} notMerge />
                      </Col>
                      <Col xs={24} sm={12}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>RSI</div>
                        <ReactECharts option={rsiOption()} style={{ height: 180 }} notMerge />
                      </Col>
                    </Row>
                    <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: '#666' }}>
                      <span>成交额: <b>{stockDetail.latest.amount ? (stockDetail.latest.amount >= 1e8 ? (stockDetail.latest.amount / 1e8).toFixed(2) + '亿' : (stockDetail.latest.amount / 1e4).toFixed(0) + '万') : '-'}</b></span>
                      <span>VOL_MA5: <b>{stockDetail.latest.VOL_MA5?.toFixed(0) ?? '-'}</b></span>
                      <span>K值: <b>{stockDetail.latest.K?.toFixed(2) ?? '-'}</b></span>
                      <span>D值: <b>{stockDetail.latest.D?.toFixed(2) ?? '-'}</b></span>
                      <span>J值: <b>{stockDetail.latest.J?.toFixed(2) ?? '-'}</b></span>
                      <span>布林上轨: <b>{stockDetail.latest.BB_UPPER?.toFixed(2) ?? '-'}</b></span>
                      <span>布林下轨: <b>{stockDetail.latest.BB_LOWER?.toFixed(2) ?? '-'}</b></span>
                    </div>
                    {/* 返回按钮 */}
                    <div style={{ textAlign: 'right', marginTop: 12 }}>
                      <Button size="small" icon={<FullscreenExitOutlined />} onClick={() => setFullScreen(false)}>
                        返回列表
                      </Button>
                    </div>
                  </>
                )}

                {/* 非全屏：策略信号 */}
                {!fullScreen && stockDetail.latest?.DIF != null && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: '#666' }}>
                    <span>DIF: <b>{stockDetail.latest.DIF.toFixed(4)}</b></span>
                    <span>DEA: <b>{stockDetail.latest.DEA.toFixed(4)}</b></span>
                    <span>MACD: <b style={{ color: stockDetail.latest.MACD >= 0 ? '#cf1322' : '#389e0d' }}>{stockDetail.latest.MACD.toFixed(4)}</b></span>
                    <span>RSI: <b>{stockDetail.latest.RSI?.toFixed(2) ?? '-'}</b></span>
                    <span>MA5: <b>{stockDetail.latest.MA5?.toFixed(2) ?? '-'}</b></span>
                    <span>MA10: <b>{stockDetail.latest.MA10?.toFixed(2) ?? '-'}</b></span>
                  </div>
                )}
              </div>
            ) : (
              <Alert message="获取详情失败" type="error" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default StockSearch
