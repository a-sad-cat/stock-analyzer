import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card, Table, Tag, Typography, Space, Select, Button, DatePicker,
  Spin, message, Input, Tooltip, Drawer, Row, Col, Descriptions, Alert,
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, DownloadOutlined,
  StockOutlined,
} from '@ant-design/icons'
import { Resizable } from 'react-resizable'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { getResults, getStrategies, runAllStrategies, getStockDetail, getStocksSectorsBatch } from '../api'

const { Title, Text } = Typography

function formatVol(v: number) {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return v.toFixed(0)
}

const Results: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<any[]>([])
  const [strategies, setStrategies] = useState<any[]>([])

  const selectedStrategy = searchParams.get('strategy') ? Number(searchParams.get('strategy')) : undefined
  const selectedDate = searchParams.get('date') || dayjs().format('YYYY-MM-DD')
  const minScore = Number(searchParams.get('minScore')) || 80
  const sectorFilter = searchParams.get('sector') || ''
  const searchKeyword = searchParams.get('q') || ''

  const setSelectedStrategy = (v: number | undefined) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('strategy', String(v)); else next.delete('strategy')
    setSearchParams(next, { replace: true })
  }
  const setSelectedDate = (v: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('date', v)
    setSearchParams(next, { replace: true })
  }
  const setMinScore = (v: number) => {
    const next = new URLSearchParams(searchParams)
    if (v > 0) next.set('minScore', String(v)); else next.delete('minScore')
    setSearchParams(next, { replace: true })
  }
  const setSectorFilter = (v: string) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('sector', v); else next.delete('sector')
    setSearchParams(next, { replace: true })
  }
  const setSearchKeyword = (v: string) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('q', v); else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const [drawerCode, setDrawerCode] = useState<string | null>(null)
  const [stockDetail, setStockDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number>(-1)
  const [sectorMap, setSectorMap] = useState<Record<string, string[]>>({})

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    code: 100, name: 100, sectors: 140, strategy: 180, score: 80, matchCount: 90, reason: 250,
  })

  const ResizableTitle = (props: any) => {
    const { onResize, width, ...restProps } = props
    if (!width) return <th {...restProps} />
    return (
      <Resizable
        width={width}
        height={0}
        handle={
          <span
            className="react-resizable-handle"
            onClick={(e) => e.stopPropagation()}
          />
        }
        onResize={onResize}
        draggableOpts={{ enableUserSelectHack: false }}
      >
        <th {...restProps} />
      </Resizable>
    )
  }

  const chartRef = useRef<any>(null)
  const klineDataRef = useRef<any[]>([])
  const kd = stockDetail?.kline || []
  klineDataRef.current = kd
  const displayIdx = selectedIdx >= 0 && selectedIdx < kd.length ? selectedIdx : kd.length - 1
  const today = kd[displayIdx]
  const isUp = today && today.pct_chg >= 0

  const loadData = async (forceRefresh = false) => {
    setLoading(true)
    try {
      const [resultsRes, strategiesRes] = await Promise.all([
        getResults(selectedDate, selectedStrategy, forceRefresh),
        getStrategies(forceRefresh).catch(() => ({ strategies: [] })),
      ])
      setResults(resultsRes.results || [])
      setStrategies(strategiesRes.strategies || [])
    } catch (err) {
      console.error('加载结果失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(true)
  }, [searchParams])

  const handleRefresh = async () => {
    message.loading({ content: '正在全市场扫描...', key: 'scan' })
    try {
      const res = await runAllStrategies()
      message.success({ content: `扫描完成！匹配 ${res.total_matched || 0} 只股票`, key: 'scan' })
      loadData()
    } catch (err) {
      message.error({ content: '扫描失败', key: 'scan' })
    }
  }

  const exportCsv = () => {
    const headers = ['股票代码', '股票名称', '匹配策略数', '最高评分', '策略详情']
    const rows = filteredResults.map((g: any) => {
      const details = (g.strategies_detail || []).map((d: any) =>
        `${d.name}(${d.score}分): ${(d.reason || '').replace(/[\n\r]/g, ' ')}`
      ).join('; ')
      return [g.stock_code, g.stock_name, g.matchCount, g.maxScore, details]
    })

    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scan-results-${selectedDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功！')
  }

  useEffect(() => {
    if (!drawerCode) return
    setDetailLoading(true)
    setStockDetail(null)
    getStockDetail(drawerCode).then(setStockDetail).catch(() => {}).finally(() => setDetailLoading(false))
  }, [drawerCode])

  // 批量加载结果中每只股票的行业/题材信息（单次请求替代 N 次）
  useEffect(() => {
    if (results.length === 0) return
    const codes = [...new Set(results.map((r: any) => r.stock_code))]
    getStocksSectorsBatch(codes).then((res) => {
      const newMap: Record<string, string[]> = {}
      if (res?.sectors) {
        for (const [code, sectors] of Object.entries(res.sectors) as [string, string[]][]) {
          if (sectors.length > 0) newMap[code] = sectors
        }
      }
      setSectorMap(newMap)
    }).catch(() => {})
  }, [results])

  const klineOption = () => {
    if (!stockDetail?.kline || stockDetail.kline.length === 0) return {}
    const data = stockDetail.kline.slice(-30)
    const dates = data.map((d: any) => d.date)
    const ohlc = data.map((d: any) => [d.open, d.close, d.low, d.high])
    const volumes = data.map((d: any) => d.volume)
    const volColors = data.map((d: any) => d.close >= d.open ? '#cf1322' : '#389e0d')
    const ma5 = data.map((d: any) => d.MA5 ?? null)
    const ma10 = data.map((d: any) => d.MA10 ?? null)
    const ma20 = data.map((d: any) => d.MA20 ?? null)
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [{ left: '3%', right: '3%', top: '5%', height: '56%' }, { left: '3%', right: '3%', top: '70%', height: '20%' }],
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

  const onChartReady = (instance: any) => {
    chartRef.current = instance
    instance.getZr().on('click', (event: any) => {
      const point = (() => {
        try {
          return instance.convertFromPixel({ seriesIndex: 0 }, [event.offsetX, event.offsetY])
        } catch { return null }
      })()
      if (point && Array.isArray(point) && point[0] != null && !isNaN(point[0])) {
        const chartIdx = Math.round(point[0])
        const fullKd = klineDataRef.current
        const fullIdx = Math.max(0, Math.min(fullKd.length - 30 + chartIdx, fullKd.length - 1))
        setSelectedIdx(fullIdx)
      }
    })
  }

  const onKlineClick = (params: any) => {
    if (params?.componentType === 'series' && params.dataIndex != null) {
      const fullKd = klineDataRef.current
      const fullIdx = Math.max(0, Math.min(fullKd.length - 30 + params.dataIndex, fullKd.length - 1))
      setSelectedIdx(fullIdx)
    }
  }

  // 按股票代码合并多策略结果
  const groupedResults = React.useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of results) {
      const key = r.stock_code
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).map(([code, items]) => {
      const first = items[0]
      return {
        key: code,
        stock_code: code,
        stock_name: first.stock_name,
        strategies: items.map(i => i.strategy_name),
        strategies_detail: items.map(i => ({ name: i.strategy_name, id: i.strategy_id, score: i.score, reason: i.reason, signals: i.signals })),
        maxScore: Math.max(...items.map(i => i.score)),
        avgScore: Math.round(items.map(i => i.score).reduce((a, b) => a + b, 0) / items.length),
        matchCount: items.length,
        items,
      }
    })
  }, [results])

  const allSectors = [...new Set(Object.values(sectorMap).flat())].sort()
  const filteredResults = groupedResults.filter((g: any) => {
    if (g.maxScore < minScore) return false
    if (selectedStrategy) {
      if (!g.strategies_detail.some((d: any) => d.id === selectedStrategy)) return false
    }
    if (sectorFilter) {
      const sectors = sectorMap[g.stock_code] || []
      if (!sectors.includes(sectorFilter)) return false
    }
    if (!searchKeyword) return true
    const kw = searchKeyword.toUpperCase()
    return g.stock_code.includes(kw) || g.stock_name.includes(kw) || g.strategies.some((s: string) => s.includes(kw))
  })

  const handleResize = (key: string) => (_: any, { size }: any) => {
    setColWidths((prev) => ({ ...prev, [key]: size.width }))
  }

  const columns = [
    {
      title: '代码',
      dataIndex: 'stock_code',
      key: 'code',
      width: colWidths.code,
      onHeaderCell: () => ({ width: colWidths.code, onResize: handleResize('code') }),
      render: (code: string) => (
        <a
          onClick={() => setDrawerCode(code)}
          style={{ fontFamily: 'monospace', fontWeight: 500 }}
        >
          {code}
        </a>
      ),
    },
    {
      title: '名称',
      dataIndex: 'stock_name',
      key: 'name',
      width: colWidths.name,
      onHeaderCell: () => ({ width: colWidths.name, onResize: handleResize('name') }),
      ellipsis: true,
    },
    {
      title: '行业/题材',
      key: 'sectors',
      width: colWidths.sectors,
      onHeaderCell: () => ({ width: colWidths.sectors, onResize: handleResize('sectors') }),
      render: (_: any, record: any) => {
        const sectors = sectorMap[record.stock_code] || []
        if (sectors.length === 0) return null
        return (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {sectors.map((s) => (
              <Tag key={s} color="purple" style={{ fontSize: 11, margin: 0 }}>{s}</Tag>
            ))}
          </span>
        )
      },
    },
    {
      title: '策略',
      key: 'strategy',
      width: colWidths.strategy,
      onHeaderCell: () => ({ width: colWidths.strategy, onResize: handleResize('strategy') }),
      render: (_: any, record: any) => {
        const names = record.strategies || []
        return (
          <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {names.map((n: string) => (
              <Tag key={n} color="blue" style={{ fontSize: 11, margin: 0 }}>{n}</Tag>
            ))}
          </span>
        )
      },
    },
    {
      title: '最高评分',
      dataIndex: 'maxScore',
      key: 'score',
      width: colWidths.score,
      onHeaderCell: () => ({ width: colWidths.score, onResize: handleResize('score') }),
      sorter: (a: any, b: any) => b.maxScore - a.maxScore,
      render: (score: number, record: any) => {
        const color = score >= 85 ? '#cf1322' : score >= 70 ? '#fa8c16' : score >= 50 ? '#1677ff' : '#999'
        return (
          <Tooltip title={record.strategies_detail.map((d: any) => `${d.name}: ${d.score}分`).join('\n')}>
            <Text strong style={{ color }}>{score}分</Text>
          </Tooltip>
        )
      },
    },
    {
      title: '匹配策略数',
      dataIndex: 'matchCount',
      key: 'matchCount',
      width: 90,
      render: (count: number) => <Tag color={count > 1 ? 'gold' : 'default'}>{count}</Tag>,
    },
    {
      title: '匹配原因',
      key: 'reason',
      width: colWidths.reason,
      onHeaderCell: () => ({ width: colWidths.reason, onResize: handleResize('reason') }),
      ellipsis: true,
      render: (_: any, record: any) => {
        const details = record.strategies_detail || []
        if (details.length === 0) return '-'
        const text = details.map((d: any) => `[${d.name}] ${d.reason || ''}`).join(' | ')
        return (
          <Tooltip title={text}>
            <Text style={{ fontSize: 12 }} ellipsis>
              {text}
            </Text>
          </Tooltip>
        )
      },
    },
  ]

  return (
    <div>
      {/* 标题栏 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, marginBottom: 4 }}>
          <StockOutlined style={{ marginRight: 8 }} />
          扫描结果
        </Title>
        <Space>
          <Text type="secondary">{filteredResults.length} 只股票</Text>
          {results.length > 0 && (
            <Text type="secondary">
              （共匹配 {results.length} 条）
            </Text>
          )}
        </Space>
      </div>

      {/* 工具栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[8, 8]}>
          <DatePicker
            size="small"
            value={dayjs(selectedDate)}
            onChange={(d) => d && setSelectedDate(d.format('YYYY-MM-DD'))}
            allowClear={false}
          />
          <Select
            size="small"
            placeholder="筛选策略"
            allowClear
            style={{ minWidth: 120 }}
            value={selectedStrategy}
            onChange={(v) => setSelectedStrategy(v)}
            options={strategies.map((s: any) => ({
              value: s.id,
              label: s.name,
            }))}
          />
          <Select
            size="small"
            value={minScore}
            onChange={(v) => setMinScore(v)}
            style={{ width: 100 }}
            options={[
              { value: 0, label: '全部评分' },
              { value: 80, label: '高分(≥80)' },
              { value: 90, label: '精选(≥90)' },
            ]}
          />
          <Select
            size="small"
            value={sectorFilter}
            onChange={(v) => setSectorFilter(v)}
            style={{ minWidth: 110 }}
            allowClear
            placeholder="筛选行业"
            options={allSectors.map((s) => ({ value: s, label: s }))}
          />
          <Input
            size="small"
            placeholder="搜索代码/名称/策略"
            prefix={<SearchOutlined />}
            style={{ width: 160 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => loadData(true)}>
            刷新
          </Button>
          <Button size="small" type="primary" onClick={handleRefresh}>
            重新扫描
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv} disabled={results.length === 0}>
            导出CSV
          </Button>
        </Space>
      </Card>

      {/* 结果表格 */}
      <Card>
        <Table
          dataSource={filteredResults}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSize: 20,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          size="small"
          scroll={{ x: 1200 }}
          components={{
            header: {
              cell: ResizableTitle,
            },
          }}
        />
      </Card>

      {/* 右侧弹出详情 */}
      <Drawer
        title={
          <Space>
            <StockOutlined />
            {stockDetail ? `${stockDetail.code} ${stockDetail.name}` : drawerCode}
          </Space>
        }
        placement="right"
        width={Math.min(1040, window.innerWidth - 48)}
        open={!!drawerCode}
        onClose={() => { setDrawerCode(null); setStockDetail(null); setSelectedIdx(-1) }}
        extra={
          <Button type="text" icon={<SearchOutlined />} onClick={() => drawerCode && navigate(`/stock/${drawerCode}`)}>
            新页面打开
          </Button>
        }
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : stockDetail ? (
          <div>
            {/* 日期选择指示 */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
              <Col>
                {selectedIdx >= 0 && displayIdx >= 0 ? (
                  <Space>
                    <Tag color="processing">{today?.date}</Tag>
                    <Button size="small" type="link" onClick={() => setSelectedIdx(-1)} style={{ fontSize: 12 }}>
                      恢复最新
                    </Button>
                  </Space>
                ) : (
                  <Tag color="default">最新</Tag>
                )}
              </Col>
            </Row>

            {/* 价格 + 统计 */}
            <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
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
                  {[['今开', today?.open], ['最高', today?.high], ['最低', today?.low],
                    ['昨收', displayIdx > 0 ? kd[displayIdx - 1]?.close : '-'],
                    ['成交量', formatVol(today?.volume)],
                    ['成交额', today?.amount ? (
                      today.amount >= 1e8
                        ? (today.amount / 1e8).toFixed(2) + '亿'
                        : (today.amount / 1e4).toFixed(0) + '万'
                    ) : '-']].map(([label, val]) => (
                    <Col span={8} key={label as string}>
                      <div style={{ fontSize: 11, color: '#999' }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{val ?? '-'}</div>
                    </Col>
                  ))}
                </Row>
              </Col>
            </Row>

            {/* 技术指标 */}
            <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
              <Col span={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="MA5">{today?.MA5?.toFixed(2) ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="MA10">{today?.MA10?.toFixed(2) ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="MA20">{today?.MA20?.toFixed(2) ?? '-'}</Descriptions.Item>
                </Descriptions>
              </Col>
              <Col span={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="DIF">{today?.DIF?.toFixed(4) ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="DEA">{today?.DEA?.toFixed(4) ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="MACD">
                    <Text style={{ color: (today?.MACD ?? 0) >= 0 ? '#cf1322' : '#389e0d' }}>
                      {today?.MACD?.toFixed(4) ?? '-'}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>

            <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
              <Col span={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="RSI(14)">{today?.RSI?.toFixed(2) ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="KDJ K值">{today?.K?.toFixed(2) ?? '-'}</Descriptions.Item>
                </Descriptions>
              </Col>
              <Col span={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="布林上轨">{today?.BB_UPPER?.toFixed(2) ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="布林下轨">{today?.BB_LOWER?.toFixed(2) ?? '-'}</Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>

            {/* K 线图 */}
            <ReactECharts
              option={klineOption()}
              style={{ height: 280 }}
              notMerge
              onChartReady={onChartReady}
              onEvents={{ click: onKlineClick }}
            />
          </div>
        ) : (
          <Alert message="获取数据失败" type="error" />
        )}
      </Drawer>
      <style>{`
        .react-resizable {
          position: relative;
          background-clip: padding-box;
        }
        .react-resizable-handle {
          position: absolute;
          right: -5px;
          bottom: 0;
          z-index: 1;
          width: 10px;
          height: 100%;
          cursor: col-resize;
        }
        .ant-table-thead th .react-resizable-handle:hover {
          background: rgba(0,0,0,0.06);
        }
        .ant-table-thead th {
          position: relative;
        }
      `}</style>
    </div>
  )
}

export default Results
