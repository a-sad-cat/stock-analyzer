import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Typography, Tag, Space, Button, Select, DatePicker, InputNumber,
  Spin, Statistic, Empty, Divider, Collapse,
} from 'antd'
import {
  PlayCircleOutlined, HistoryOutlined, BarChartOutlined,
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { motion } from 'framer-motion'
import dayjs from 'dayjs'
import {
  runBacktest, getBacktestRuns, getBacktestDetail, getBacktestTrades,
  getStrategies, getStrategyBacktestSummary,
} from '../api'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

const { Text } = Typography
const { RangePicker } = DatePicker

const EXIT_LABELS: Record<string, string> = {
  stop_loss: '硬止损', ma_break: '破均线', trailing_stop: '移动止盈',
  breakeven_exit: '回本止盈', max_hold: '持有到期', capital_outflow: '资金流出',
}
const EXIT_COLORS: Record<string, string> = {
  stop_loss: 'red', ma_break: 'orange', trailing_stop: 'green',
  breakeven_exit: 'cyan', max_hold: 'default', capital_outflow: 'purple',
}

const PAGE_SIZE = 20

const Backtest: React.FC = () => {
  const navigate = useNavigate()

  const [strategies, setStrategies] = useState<any[]>([])
  const [selectedStrategy, setSelectedStrategy] = useState<number | undefined>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(2, 'month'), dayjs(),
  ])
  const [stockLimit, setStockLimit] = useState(200)
  const [minScore, setMinScore] = useState(80)
  const [exitRules, setExitRules] = useState<any[]>([
    { type: 'stop_loss', pct: -7, enabled: true },
    { type: 'trailing_stop', activate: 8, pullback: 3, enabled: true },
    { type: 'ma_break', ma: 10, enabled: true },
    { type: 'breakeven_exit', min_hold: 5, enabled: true },
    { type: 'max_hold', days: 20, enabled: true },
  ])
  const [running, setRunning] = useState(false)
  const [currentRun, setCurrentRun] = useState<any>(null)
  const [runs, setRuns] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const [tradesTotal, setTradesTotal] = useState(0)
  const [tradesPage, setTradesPage] = useState(1)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [selectedRun, setSelectedRun] = useState<number | undefined>()
  const [strategySummary, setStrategySummary] = useState<Record<number, any>>({})

  useEffect(() => { loadStrategies(); loadRuns() }, [])

  const loadStrategies = async () => {
    try { const res = await getStrategies(true); setStrategies(res.strategies || []) } catch {}
  }

  useEffect(() => {
    if (strategies.length > 0) {
      const load = async () => {
        const map: Record<number, any> = {}
        const results = await Promise.allSettled(
          strategies.map((s) => getStrategyBacktestSummary(s.id))
        )
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value.has_backtest) {
            map[strategies[i].id] = r.value
          }
        })
        setStrategySummary(map)
      }
      load()
    }
  }, [strategies])

  useEffect(() => {
    if (selectedRun) {
      getBacktestDetail(selectedRun).then(setCurrentRun).catch(() => {})
      loadTrades(selectedRun, 1)
    }
  }, [selectedRun])

  const loadRuns = async () => {
    setLoadingRuns(true)
    try { const res = await getBacktestRuns(); setRuns(res.runs || []) } catch {} finally { setLoadingRuns(false) }
  }

  const loadTrades = async (id: number, page = 1) => {
    try {
      const res = await getBacktestTrades(id, page, PAGE_SIZE)
      setTrades(res.trades || [])
      setTradesTotal(res.total || 0)
      setTradesPage(page)
    } catch {}
  }

  const handleRun = async () => {
    if (!selectedStrategy || !dateRange[0] || !dateRange[1]) return
    setRunning(true)
    setCurrentRun(null)
    try {
      const enabledRules = exitRules.filter((r) => r.enabled)
      const res = await runBacktest({
        strategy_id: selectedStrategy,
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
        stock_limit: stockLimit,
        min_score: minScore,
        exit_rules: enabledRules.map(({ enabled, ...rule }) => rule),
      })
      if (res.run_id) {
        setSelectedRun(res.run_id)
        getBacktestDetail(res.run_id).then(setCurrentRun)
        loadTrades(res.run_id, 1)
        loadRuns()
      }
    } catch { /* silent */ } finally { setRunning(false) }
  }

  const equityOption = () => {
    if (!currentRun?.daily_equity?.length) return {}
    const data = currentRun.daily_equity
    const dates = data.map((d: any) => d.date.slice(5))
    const values = data.map((d: any) => d.equity)
    return {
      animation: true,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const d = data[params[0].dataIndex]
          return `<b>${d.date}</b><br/>累计收益: <b style="color:${d.equity >= 0 ? '#f5222d' : '#52c41a'}">${d.equity >= 0 ? '+' : ''}${d.equity.toFixed(2)}%</b>`
        },
      },
      grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: '{value}%', fontSize: 10 } },
      series: [{
        type: 'line', data: values, smooth: true, symbol: 'none',
        lineStyle: { width: 2, color: '#1677ff' },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(22,119,255,0.25)' }, { offset: 1, color: 'rgba(22,119,255,0.02)' }] },
        },
        markLine: { silent: true, data: [{ yAxis: 0, label: { formatter: '平衡线' }, lineStyle: { color: '#999', type: 'dashed' } }] },
      }],
    }
  }

  const regimeOption = () => {
    if (!currentRun?.regime_breakdown) return {}
    const data = currentRun.regime_breakdown
    const labels: Record<string, string> = { strong_bull: '强势上涨', weak_bull: '弱势上涨', sideways: '震荡', weak_bear: '弱势下跌', strong_bear: '强势下跌', unknown: '未知' }
    const colors: Record<string, string> = { strong_bull: '#f5222d', weak_bull: '#fa8c16', sideways: '#1677ff', weak_bear: '#52c41a', strong_bear: '#389e0d', unknown: '#999' }
    const keys = Object.keys(data).filter((k) => data[k].count > 0)
    return {
      animation: true,
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
      xAxis: { type: 'category', data: keys.map((k) => labels[k] || k), axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: 'value', name: '胜率 %', max: 100, axisLabel: { formatter: '{value}%', fontSize: 10 } },
        { type: 'value', name: '平均收益 %', axisLabel: { formatter: '{value}%', fontSize: 10 } },
      ],
      series: [
        { name: '胜率', type: 'bar', data: keys.map((k) => data[k].win_rate), itemStyle: { color: (p: any) => colors[keys[p.dataIndex]] || '#1677ff' }, yAxisIndex: 0, barWidth: '30%' },
        { name: '平均收益', type: 'bar', data: keys.map((k) => data[k].avg_return), itemStyle: { color: (p: any) => data[keys[p.dataIndex]].avg_return >= 0 ? '#f5222d' : '#52c41a' }, yAxisIndex: 1, barWidth: '30%' },
      ],
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 17 }}><BarChartOutlined style={{ marginRight: 6 }} />策略回测</Text>
        <Button icon={<ReloadOutlined />} size="small" onClick={loadRuns}>刷新</Button>
      </div>

      {/* Config panel */}
      <div className="card-mobile" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>选择策略</Text>
            <Select
              value={selectedStrategy} onChange={setSelectedStrategy} style={{ width: '100%' }} size="small"
              placeholder="选择策略"
              options={strategies.map((s: any) => ({ value: s.id, label: `${s.name}${strategySummary[s.id] ? ` (胜率${strategySummary[s.id].win_rate}%)` : ''}` }))}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>回测区间</Text>
            <RangePicker
              value={dateRange} size="small" style={{ width: '100%' }}
              onChange={(d) => { if (d && d[0] && d[1]) setDateRange([d[0], d[1]]) }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>扫描股票数</Text>
              <InputNumber value={stockLimit} onChange={(v) => setStockLimit(v || 200)} min={50} max={5000} size="small" style={{ width: '100%' }} />
            </div>
            <div>
              <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>最低评分</Text>
              <InputNumber value={minScore} onChange={(v) => setMinScore(v || 80)} min={0} max={100} size="small" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>退出规则（点击切换）</Text>
            <Space size={4} wrap>
              {exitRules.map((rule, idx) => (
                <Tag
                  key={rule.type}
                  color={rule.enabled ? 'blue' : 'default'}
                  style={{ cursor: 'pointer', fontSize: 11 }}
                  onClick={() => {
                    const copy = [...exitRules]
                    copy[idx] = { ...copy[idx], enabled: !copy[idx].enabled }
                    setExitRules(copy)
                  }}
                >
                  {EXIT_LABELS[rule.type] || rule.type}
                </Tag>
              ))}
            </Space>
          </div>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun} loading={running} block disabled={!selectedStrategy}>
            运行回测
          </Button>
        </div>
      </div>

      {/* Results */}
      {currentRun && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
            {[
              ['信号', currentRun.total_signals, '次', undefined],
              ['胜率', currentRun.win_rate, '%', currentRun.win_rate >= 50 ? '#f5222d' : '#52c41a'],
              ['平均收益', currentRun.avg_return, '%', currentRun.avg_return >= 0 ? '#f5222d' : '#52c41a'],
              ['最大回撤', currentRun.max_drawdown, '%', '#fa8c16'],
              ['盈亏比', currentRun.profit_loss_ratio, '', currentRun.profit_loss_ratio >= 1.5 ? '#f5222d' : '#999'],
              ['平均持有', currentRun.avg_hold_days, '天', undefined],
            ].map(([title, val, unit, color]) => (
              <div key={title as string} className="card-mobile" style={{ padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#999' }}>{title}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (color as string) || '#333' }}>
                  {typeof val === 'number' ? val.toFixed(val % 1 === 0 ? 0 : 1) : val}{unit}
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="chart-box" style={{ padding: '8px 4px', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, padding: '4px 8px', color: '#666' }}>累计收益曲线</div>
            <ReactECharts option={equityOption()} style={{ height: 220 }} />
          </div>

          {currentRun.regime_breakdown && Object.keys(currentRun.regime_breakdown).some((k: string) => currentRun.regime_breakdown[k].count > 0) && (
            <div className="chart-box" style={{ padding: '8px 4px', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, padding: '4px 8px', color: '#666' }}>市场环境分析</div>
              <ReactECharts option={regimeOption()} style={{ height: 200 }} />
            </div>
          )}

          {/* Trade list */}
          <div className="card-mobile" style={{ padding: 14, marginBottom: 12 }}>
            <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
              <HistoryOutlined style={{ marginRight: 4 }} />交易明细 ({tradesTotal} 笔)
            </Text>
            {trades.map((t: any) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 6,
                  border: '1px solid var(--color-border)',
                  background: t.holding_return >= 0 ? 'linear-gradient(90deg, #f6ffed, #fff)' : 'linear-gradient(90deg, #fff1f0, #fff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Space size={4}>
                      <a onClick={() => navigate(`/stock/${t.stock_code}`)} style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>
                        {t.stock_code}
                      </a>
                      <Text style={{ fontSize: 13 }}>{t.stock_name}</Text>
                      <Tag color={EXIT_COLORS[t.exit_reason] || 'default'} style={{ fontSize: 10, margin: 0 }}>
                        {EXIT_LABELS[t.exit_reason] || t.exit_reason}
                      </Tag>
                    </Space>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {t.signal_date} · 入场 {t.entry_price?.toFixed(2)} · 持有 {t.hold_days}天
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: t.holding_return >= 0 ? '#f5222d' : '#52c41a' }}>
                      {t.holding_return >= 0 ? '+' : ''}{t.holding_return}%
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>评分 {t.score}</div>
                  </div>
                </div>
              </motion.div>
            ))}
            {trades.length === 0 && <Empty description="暂无交易" />}
            {tradesTotal > PAGE_SIZE && (
              <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                <Button size="small" disabled={tradesPage <= 1} onClick={() => { const p = tradesPage - 1; setTradesPage(p); if (selectedRun) loadTrades(selectedRun, p) }}>上一页</Button>
                <Text style={{ lineHeight: '24px', fontSize: 12, color: '#999' }}>{tradesPage} / {Math.ceil(tradesTotal / PAGE_SIZE)}</Text>
                <Button size="small" disabled={tradesPage >= Math.ceil(tradesTotal / PAGE_SIZE)} onClick={() => { const p = tradesPage + 1; setTradesPage(p); if (selectedRun) loadTrades(selectedRun, p) }}>下一页</Button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {!currentRun && !running && (
        <div className="card-mobile" style={{ padding: 32, textAlign: 'center' }}>
          <EmptyState description="选择策略并点击「运行回测」开始" />
        </div>
      )}

      <Divider />

      {/* Backtest history */}
      <Collapse
        items={[{
          key: 'history',
          label: <Space><HistoryOutlined />回测历史 ({runs.length})</Space>,
          children: (
            loadingRuns ? <Spin /> : runs.length === 0 ? <Empty description="暂无回测记录" /> : (
              <div>
                {runs.map((r: any) => (
                  <div key={r.id}
                    onClick={() => setSelectedRun(r.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                      background: selectedRun === r.id ? '#e6f4ff' : '#fafafa',
                      border: selectedRun === r.id ? '1px solid #91caff' : '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{r.strategy_name}</Text>
                        <div style={{ fontSize: 11, color: '#999' }}>{r.start_date} ~ {r.end_date}</div>
                      </div>
                      <Space size={8}>
                        <Text style={{ fontSize: 13, color: r.win_rate >= 50 ? '#f5222d' : '#52c41a' }}>胜率 {r.win_rate}%</Text>
                        <Text style={{ fontSize: 13, color: r.avg_return >= 0 ? '#f5222d' : '#52c41a' }}>{r.avg_return >= 0 ? '+' : ''}{r.avg_return}%</Text>
                        <Tag color={r.status === 'done' ? 'green' : r.status === 'error' ? 'red' : 'processing'} style={{ fontSize: 10, margin: 0 }}>{r.status}</Tag>
                      </Space>
                    </div>
                  </div>
                ))}
              </div>
            )
          ),
        }]}
      />
    </div>
  )
}

export default Backtest
