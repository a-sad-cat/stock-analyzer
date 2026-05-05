import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Typography, Select, DatePicker, Input, Spin, message } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import dayjs from 'dayjs'
import { getResults, getStrategies, getStocksSectorsBatch } from '../api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import StockListItem from '../components/StockListItem'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

const { Text } = Typography
const PAGE_SIZE = 20

const MARKET_SEGMENTS = [
  { value: '', label: '全部市场' },
  { value: 'main', label: '主板（沪+深）' },
  { value: 'gem', label: '创业板' },
  { value: 'star', label: '科创板' },
]

function getMarketSegment(code: string): string {
  if (/^300|^301/.test(code)) return 'gem'
  if (/^688/.test(code)) return 'star'
  // 沪市主板: 6开头但不是688; 深市主板: 00开头
  if (/^6/.test(code)) return 'main'
  if (/^00/.test(code)) return 'main'
  return 'other'
}

const Results: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<any[]>([])
  const [strategies, setStrategies] = useState<any[]>([])
  const [sectorMap, setSectorMap] = useState<Record<string, string[]>>({})
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [filterOpen, setFilterOpen] = useState(false)

  const selectedStrategy = searchParams.get('strategy') ? Number(searchParams.get('strategy')) : undefined
  const selectedDate = searchParams.get('date') || dayjs().format('YYYY-MM-DD')
  const minScore = Number(searchParams.get('minScore')) || 80
  const sectorFilter = searchParams.get('sector') || ''
  const marketFilter = searchParams.get('market') || ''
  const searchKeyword = searchParams.get('q') || ''

  const setParam = (key: string, value: string | number | undefined) => {
    const next = new URLSearchParams(searchParams)
    if (value != null && value !== '') next.set(key, String(value))
    else next.delete(key)
    setSearchParams(next, { replace: true })
    setDisplayCount(PAGE_SIZE)
  }

  const [qInput, setQInput] = useState(searchKeyword)
  const qTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => { setQInput(searchKeyword) }, [searchKeyword])
  const handleQChange = (v: string) => {
    setQInput(v)
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => setParam('q', v || undefined), 300)
  }

  const loadData = async (forceRefresh = false) => {
    if (!forceRefresh) setLoading(true)
    try {
      const [rRes, sRes] = await Promise.all([
        getResults(selectedDate, selectedStrategy, forceRefresh),
        getStrategies(forceRefresh).catch(() => ({ strategies: [] })),
      ])
      setResults(rRes.results || [])
      setStrategies(sRes.strategies || [])
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { loadData(false) }, [searchParams])

  useEffect(() => {
    if (results.length === 0) return
    const codes = [...new Set(results.map((r: any) => r.stock_code))]
    getStocksSectorsBatch(codes).then((res) => {
      const m: Record<string, string[]> = {}
      if (res?.sectors) {
        for (const [code, sectors] of Object.entries(res.sectors) as [string, string[]][]) {
          if (sectors.length > 0) m[code] = sectors
        }
      }
      setSectorMap(m)
    }).catch(() => {})
  }, [results])

  const groupedResults = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of results) {
      const key = r.stock_code
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).map(([code, items]) => ({
      key: code,
      stock_code: code,
      stock_name: items[0].stock_name,
      maxScore: Math.max(...items.map(i => i.score)),
      matchCount: items.length,
      items,
      strategies: items.map(i => i.strategy_name),
    }))
  }, [results])

  const allSectors = useMemo(() => [...new Set(Object.values(sectorMap).flat())].sort(), [sectorMap])

  const filtered = useMemo(() => groupedResults.filter((g: any) => {
    if (g.maxScore < minScore) return false
    if (selectedStrategy && !g.items.some((d: any) => d.strategy_id === selectedStrategy)) return false
    if (sectorFilter && !(sectorMap[g.stock_code] || []).includes(sectorFilter)) return false
    if (marketFilter && getMarketSegment(g.stock_code) !== marketFilter) return false
    if (searchKeyword) {
      const kw = searchKeyword.toUpperCase()
      if (!g.stock_code.includes(kw) && !g.stock_name.includes(kw) && !g.strategies.some((s: string) => s.includes(kw))) return false
    }
    return true
  }), [groupedResults, minScore, selectedStrategy, sectorFilter, marketFilter, sectorMap, searchKeyword])

  useEffect(() => { setDisplayCount(PAGE_SIZE) }, [filtered.length])

  const hasMore = displayCount < filtered.length
  const loadMore = useCallback(() => {
    setDisplayCount(c => Math.min(c + PAGE_SIZE, filtered.length))
  }, [filtered.length])

  const { sentinelRef } = useInfiniteScroll({ hasMore, loading: false, onLoadMore: loadMore })

  const exportCsv = () => {
    const headers = ['股票代码', '股票名称', '匹配策略数', '最高评分', '策略详情']
    const rows = filtered.map((g: any) => {
      const details = (g.items || []).map((d: any) => `${d.strategy_name}(${d.score}分): ${(d.reason || '').replace(/[\n\r]/g, ' ')}`).join('; ')
      return [g.stock_code, g.stock_name, g.matchCount, g.maxScore, details]
    })
    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `scan-results-${selectedDate}.csv`
    a.click(); URL.revokeObjectURL(url)
    message.success('导出成功')
  }

  const paged = useMemo(() => filtered.slice(0, displayCount), [filtered, displayCount])

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        background: '#fff', borderRadius: 14, padding: '4px 4px 4px 14px',
        border: '1px solid var(--color-border)',
      }}>
        <SearchOutlined style={{ color: '#b0b8c1', fontSize: 16 }} />
        <Input
          size="small"
          placeholder="搜索代码/名称"
          value={qInput}
          onChange={(e) => handleQChange(e.target.value)}
          allowClear
          variant="borderless"
          style={{ flex: 1 }}
        />
        <div
          onClick={() => setFilterOpen(!filterOpen)}
          style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: filterOpen ? 'var(--color-primary-light)' : 'transparent',
            color: filterOpen ? 'var(--color-primary)' : '#b0b8c1',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <FilterOutlined style={{ fontSize: 14 }} />
        </div>
        <div
          onClick={() => loadData(true)}
          style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#b0b8c1', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <ReloadOutlined style={{ fontSize: 14 }} />
        </div>
      </div>

      {/* Collapsible filters */}
      {filterOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ overflow: 'hidden' }}
        >
          <div style={{
            background: '#fff', borderRadius: 14, padding: '10px 14px',
            marginBottom: 10, border: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8e99a4', flexShrink: 0, width: 28 }}>日期</Text>
              <DatePicker
                size="small"
                value={dayjs(selectedDate)}
                onChange={(d) => d && setParam('date', d.format('YYYY-MM-DD'))}
                allowClear={false}
                style={{ flex: 1, minWidth: 100 }}
                variant="filled"
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8e99a4', flexShrink: 0, width: 28 }}>策略</Text>
              <Select
                showSearch
                size="small" placeholder="全部" allowClear value={selectedStrategy}
                onChange={(v) => setParam('strategy', v)}
                style={{ flex: 1, minWidth: 100 }}
                variant="filled"
                filterOption={(input, option) => (option?.label as string)?.includes(input)}
                options={strategies.map((s: any) => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8e99a4', flexShrink: 0, width: 28 }}>评分</Text>
              <Select
                size="small" value={minScore} onChange={(v) => setParam('minScore', v)}
                style={{ flex: 1, minWidth: 100 }} variant="filled"
                options={[{ value: 0, label: '全部' }, { value: 80, label: '≥80' }, { value: 90, label: '≥90' }]}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8e99a4', flexShrink: 0, width: 28 }}>行业</Text>
              <Select
                showSearch
                size="small" placeholder="全部" allowClear value={sectorFilter}
                onChange={(v) => setParam('sector', v)}
                style={{ flex: 1, minWidth: 100 }} variant="filled"
                filterOption={(input, option) => (option?.label as string)?.includes(input)}
                options={allSectors.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8e99a4', flexShrink: 0, width: 28 }}>板块</Text>
              <Select
                size="small" value={marketFilter} onChange={(v) => setParam('market', v)}
                style={{ flex: 1, minWidth: 100 }} variant="filled"
                options={MARKET_SEGMENTS}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div onClick={exportCsv} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                color: filtered.length === 0 ? '#b0b8c1' : 'var(--color-primary)', cursor: 'pointer',
              }}>
                <DownloadOutlined style={{ fontSize: 12 }} />导出 CSV
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: 600 }}>扫描结果</Text>
        <Text style={{ fontSize: 11, color: '#8e99a4' }}>
          {filtered.length} 只
        </Text>
      </div>

      {/* Result list */}
      {loading ? (
        <SkeletonCard count={5} />
      ) : paged.length > 0 ? (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map((g: any, i: number) => (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <StockListItem
                  code={g.stock_code}
                  name={g.stock_name}
                  score={g.maxScore}
                  matchCount={g.matchCount}
                  strategyName={g.items[0]?.strategy_name}
                  sectors={sectorMap[g.stock_code]?.slice(0, 3)}
                  reason={g.items.map((d: any) => `[${d.strategy_name}] ${d.reason || ''}`).join(' | ')}
                  onClick={() => navigate(`/stock/${g.stock_code}`)}
                />
              </motion.div>
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: '16px 0' }}>
              <Spin size="small" />
            </div>
          )}
        </div>
      ) : (
        <EmptyState description="暂无扫描结果" />
      )}
    </div>
  )
}

export default Results
