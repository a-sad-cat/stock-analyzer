import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Spin, Typography, Space, Tag, Button } from 'antd'
import { SearchOutlined, HistoryOutlined, CloseOutlined, DeleteOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import { searchStocks, saveSearchKeyword, getSearchHistory, getStockDetail, deleteSearchHistory, deleteSearchKeyword } from '../api'
import { mobileKlineOption } from '../utils/echartsTheme'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import EmptyState from '../components/EmptyState'

const { Text } = Typography

function formatVol(v: number) {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return v.toFixed(0)
}

const SEARCH_PAGE_SIZE = 30

const StockSearch: React.FC = () => {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [stockDetail, setStockDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const chartRef = useRef<any>(null)
  const [crosshairIdx, setCrosshairIdx] = useState(-1)
  const chartKdRef = useRef<any[]>([])
  const visibleHighLowRef = useRef<{ highIdx: number; highVal: number; lowIdx: number; lowVal: number } | null>(null)
  const dataZoomRangeRef = useRef({ start: 75, end: 100 })
  const [displayCount, setDisplayCount] = useState(SEARCH_PAGE_SIZE)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { loadHistory() }, [])

  const loadHistory = async () => {
    try { const res = await getSearchHistory(); setHistory(res.keywords || []) } catch {}
  }

  const doSearch = async (kw: string) => {
    if (!kw.trim()) return
    setLoading(true)
    try { const res = await searchStocks(kw); setResults(res.stocks || []) } catch { setResults([]) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!keyword.trim()) { setResults([]); return }
    setDisplayCount(SEARCH_PAGE_SIZE)
    timer.current = setTimeout(() => doSearch(keyword.trim()), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [keyword])

  useEffect(() => { setDisplayCount(SEARCH_PAGE_SIZE) }, [results.length])

  const hasMore = displayCount < results.length
  const loadMore = useCallback(() => {
    setDisplayCount(c => Math.min(c + SEARCH_PAGE_SIZE, results.length))
  }, [results.length])

  const { sentinelRef } = useInfiniteScroll({ hasMore, loading, onLoadMore: loadMore })

  const handleSearch = (kw?: string) => {
    const k = (kw || keyword).trim()
    if (!k) return
    doSearch(k)
    saveSearchKeyword(k).catch(() => {}).then(loadHistory)
  }

  const handleClickStock = (code: string) => {
    if (code === selectedCode) return
    setSelectedCode(code)
    setDetailLoading(true)
    setStockDetail(null)
    getStockDetail(code).then(setStockDetail).catch(() => {}).finally(() => setDetailLoading(false))
  }

  const kd = stockDetail?.kline || []
  const chartKd = useMemo(() => kd.slice(-60), [kd])
  chartKdRef.current = chartKd
  const today = kd[kd.length - 1]
  const isUp = today && today.pct_chg >= 0

  useEffect(() => { setCrosshairIdx(-1) }, [selectedCode])

  const chartReadyHandler = useCallback((echarts: any) => {
    chartRef.current = echarts

    echarts.on('showTip', (params: any) => {
      if (params.dataIndex != null) setCrosshairIdx(params.dataIndex)
    })
    echarts.on('hideTip', () => setCrosshairIdx(-1))

    echarts.on('dataZoom', () => {
      if (chartRef.current) chartRef.current.dispatchAction({ type: 'hideTip', seriesIndex: 0 })
    })

    const updateVisibleRange = () => {
      const data = chartKdRef.current
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
  }, [chartKd])

  const crosshairItem = crosshairIdx >= 0 && crosshairIdx < chartKd.length ? chartKd[crosshairIdx] : null
  const crosshairPrev = crosshairIdx > 0 ? chartKd[crosshairIdx - 1] : null
  const displayToday = crosshairItem || today
  const displayPrev = crosshairItem ? crosshairPrev : (kd.length >= 2 ? kd[kd.length - 2] : null)
  const displayIsUp = crosshairItem
    ? (crosshairItem.pct_chg ?? (crosshairPrev ? ((crosshairItem.close - crosshairPrev.close) / crosshairPrev.close * 100) : 0)) >= 0
    : isUp
  const displayPct = crosshairItem
    ? (crosshairItem.pct_chg ?? (crosshairPrev ? ((crosshairItem.close - crosshairPrev.close) / crosshairPrev.close * 100) : 0))
    : today?.pct_chg ?? 0
  const displayDate = crosshairItem?.date ?? today?.date

  const displayItem = crosshairItem || today
  const maValues = displayItem ? {
    ma5: displayItem.MA5,
    ma10: displayItem.MA10,
    ma20: displayItem.MA20,
  } : null

  const chartOption = useMemo(() => {
    const opt = mobileKlineOption(chartKd, { visibleHighLow: visibleHighLowRef.current })
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
  }, [chartKd])

  const paged = useMemo(() => results.slice(0, displayCount), [results, displayCount])

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Search input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#fff', borderRadius: 14, padding: '4px 4px 4px 14px',
        border: '1px solid var(--color-border)', marginBottom: 10,
      }}>
        <SearchOutlined style={{ color: '#b0b8c1', fontSize: 16 }} />
        <Input
          size="large"
          placeholder="输入股票代码或名称"
          variant="borderless"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); if (selectedCode) { setSelectedCode(null); setStockDetail(null) } }}
          onPressEnter={() => handleSearch()}
          style={{ flex: 1 }}
          allowClear
        />
      </div>

      {/* Search history */}
      {!keyword.trim() && history.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <HistoryOutlined style={{ color: '#b0b8c1', fontSize: 13 }} />
            <Text style={{ fontSize: 12, color: '#8e99a4' }}>最近搜索</Text>
            <Button type="link" size="small" danger onClick={async () => { await deleteSearchHistory(); loadHistory() }} style={{ padding: 0, fontSize: 11 }}>
              清空
            </Button>
          </div>
          <div className="scroll-x" style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
            {history.map((kw) => (
              <div key={kw} style={{ position: 'relative', flexShrink: 0 }}>
                <Tag
                  style={{ cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 16, margin: 0 }}
                  onClick={() => { setKeyword(kw); handleSearch(kw) }}
                >
                  {kw}
                </Tag>
                <CloseOutlined
                  style={{ position: 'absolute', top: -2, right: 6, fontSize: 9, color: '#999' }}
                  onClick={async (e) => { e.stopPropagation(); await deleteSearchKeyword(kw); loadHistory() }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {!selectedCode && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : results.length > 0 ? (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {paged.map((s: any, i: number) => (
                  <motion.div
                    key={s.code}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleClickStock(s.code)}
                    style={{
                      background: selectedCode === s.code ? '#e0f7ff' : '#fff',
                      borderRadius: 14,
                      padding: '12px 14px',
                      border: selectedCode === s.code ? '1px solid rgba(18,183,245,0.3)' : '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Tag color={s.market === 'SH' ? 'blue' : s.market === 'SZ' ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                          {s.market}
                        </Tag>
                        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#8e99a4' }}>{s.code}</Text>
                      </div>
                      <Text strong style={{ fontSize: 15 }}>{s.name}</Text>
                    </div>
                    {s.close != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: s.pct_chg >= 0 ? '#f5222d' : '#52c41a' }}>
                          {s.close.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 12, color: s.pct_chg >= 0 ? '#f5222d' : '#52c41a' }}>
                          {s.pct_chg >= 0 ? '+' : ''}{s.pct_chg?.toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {hasMore && !loading && (
                <div ref={sentinelRef} style={{ textAlign: 'center', padding: '16px 0' }}>
                  <Spin size="small" />
                </div>
              )}
            </div>
          ) : keyword.trim() ? (
            <EmptyState description="未找到匹配的股票" />
          ) : null}
        </div>
      )}

      {/* Stock detail */}
      {selectedCode && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : stockDetail ? (
            <div>
              {/* Detail header */}
              <div
                className="card-mobile"
                style={{
                  padding: 14,
                  marginBottom: 10,
                  background: displayIsUp ? 'linear-gradient(135deg, #fff1f0, #ffffff)' : 'linear-gradient(135deg, #f6ffed, #ffffff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{stockDetail.market === 'SH' ? 'SH' : 'SZ'}</Tag>
                    <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#8e99a4' }}>{stockDetail.code}</Text>
                    <Text strong style={{ fontSize: 16 }}>{stockDetail.name}</Text>
                    {crosshairItem && (
                      <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>{displayDate}</Tag>
                    )}
                  </div>
                  <Space>
                    <Button size="small" icon={<FullscreenOutlined />} onClick={() => setFullScreen(true)} />
                    <Button size="small" icon={<CloseOutlined />} onClick={() => { setSelectedCode(null); setStockDetail(null); setFullScreen(false) }} />
                  </Space>
                </div>

                <div style={{ fontSize: 30, fontWeight: 700, color: displayIsUp ? '#f5222d' : '#52c41a' }}>
                  {displayToday?.close?.toFixed(2) ?? '-'}
                  <span style={{ fontSize: 13, color: '#8e99a4', fontWeight: 400, marginLeft: 4 }}>元</span>
                </div>
                <div style={{ fontSize: 14, color: displayIsUp ? '#f5222d' : '#52c41a', marginBottom: 8 }}>
                  {displayIsUp ? '+' : ''}{displayPct.toFixed(2)}%
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[['今开', displayToday?.open], ['最高', displayToday?.high], ['最低', displayToday?.low], ['昨收', displayPrev?.close], ['成交量', formatVol(displayToday?.volume)]].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: 11, color: '#8e99a4' }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : '-'}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ position: 'relative', marginBottom: 10 }}>
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
                  style={{ height: fullScreen ? 280 : 220, touchAction: 'none' }}
                  onChartReady={chartReadyHandler}
                />
              </div>

              {/* Fullscreen extra */}
              {fullScreen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 12, color: '#8e99a4', marginBottom: 8 }}>
                    <span>成交额: <b>{stockDetail.latest.amount ? formatVol(stockDetail.latest.amount) : '-'}</b></span>
                    <span>K值: <b>{stockDetail.latest.K?.toFixed(2) ?? '-'}</b></span>
                    <span>D值: <b>{stockDetail.latest.D?.toFixed(2) ?? '-'}</b></span>
                    <span>J值: <b>{stockDetail.latest.J?.toFixed(2) ?? '-'}</b></span>
                    <span>布林上轨: <b>{stockDetail.latest.BB_UPPER?.toFixed(2) ?? '-'}</b></span>
                    <span>布林下轨: <b>{stockDetail.latest.BB_LOWER?.toFixed(2) ?? '-'}</b></span>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <EmptyState description="获取详情失败" />
          )}
        </motion.div>
      )}
    </div>
  )
}

export default StockSearch
