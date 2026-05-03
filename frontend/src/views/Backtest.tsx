import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Typography, Spin, Alert, Tag, Space, Table,
  Select, DatePicker, InputNumber, Button, Divider, Statistic, Tooltip, Empty, Checkbox, Collapse,
} from 'antd'
import {
  PlayCircleOutlined, HistoryOutlined, BarChartOutlined,
  ArrowUpOutlined, ArrowDownOutlined, RiseOutlined, FallOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import {
  runBacktest, getBacktestRuns, getBacktestDetail, getBacktestTrades,
  getStrategies, getStrategyBacktestSummary,
} from '../api'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { Panel } = Collapse

const EXIT_RULE_LABELS: Record<string, string> = {
  stop_loss: '硬止损',
  ma_break: '破均线',
  trailing_stop: '移动止盈',
  breakeven_exit: '回本止盈',
  max_hold: '持有到期',
  capital_outflow: '资金流出',
}

const EXIT_RULE_COLORS: Record<string, string> = {
  stop_loss: 'red',
  ma_break: 'orange',
  trailing_stop: 'green',
  breakeven_exit: 'cyan',
  max_hold: 'default',
  capital_outflow: 'purple',
}

const PAGE_CACHE_KEY = 'page:backtest'
const CACHE_VERSION = 2

function savePageState(obj: Record<string, any>) {
  try { sessionStorage.setItem(PAGE_CACHE_KEY, JSON.stringify({ ...obj, _v: CACHE_VERSION })) } catch {}
}

function loadPageState(): Record<string, any> | null {
  try {
    const raw = sessionStorage.getItem(PAGE_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data._v === CACHE_VERSION ? data : null
  } catch { return null }
}

const Backtest: React.FC = () => {
  const navigate = useNavigate()
  const cache = loadPageState()

  const [strategies, setStrategies] = useState<any[]>(cache?.strategies ?? [])
  const [selectedStrategy, setSelectedStrategy] = useState<number | undefined>(cache?.selectedStrategy)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(
    cache?.dateRange
      ? [dayjs(cache.dateRange[0]), dayjs(cache.dateRange[1])]
      : [dayjs().subtract(2, 'month'), dayjs()],
  )
  const [stockLimit, setStockLimit] = useState(cache?.stockLimit ?? 200)
  const [minScore, setMinScore] = useState(cache?.minScore ?? 80)
  const [exitRules, setExitRules] = useState<any[]>(cache?.exitRules ?? [
    { type: 'stop_loss', pct: -7, enabled: true },
    { type: 'trailing_stop', activate: 8, pullback: 3, enabled: true },
    { type: 'ma_break', ma: 10, enabled: true },
    { type: 'breakeven_exit', min_hold: 5, enabled: true },
    { type: 'max_hold', days: 20, enabled: true },
  ])
  const [running, setRunning] = useState(false)
  const [currentRun, setCurrentRun] = useState<any>(cache?.currentRun ?? null)
  const [runs, setRuns] = useState<any[]>(cache?.runs ?? [])
  const [trades, setTrades] = useState<any[]>(cache?.trades ?? [])
  const [tradesTotal, setTradesTotal] = useState(cache?.tradesTotal ?? 0)
  const [tradesPage, setTradesPage] = useState(cache?.tradesPage ?? 1)
  const [tradesPageSize, setTradesPageSize] = useState(cache?.tradesPageSize ?? 50)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [selectedRun, setSelectedRun] = useState<number | undefined>(cache?.selectedRun)
  const [strategySummary, setStrategySummary] = useState<Record<number, any>>(cache?.strategySummary ?? {})

  useEffect(() => {
    if (!cache) {
      loadStrategies()
      loadRuns()
    }
  }, [])

  useEffect(() => {
    if (strategies.length > 0) {
      loadStrategySummaries()
    }
  }, [strategies])

  useEffect(() => {
    if (selectedRun) {
      loadRunDetail(selectedRun)
      loadTrades(selectedRun, 1, tradesPageSize)
    }
  }, [selectedRun])

  const loadStrategies = async () => {
    try {
      const res = await getStrategies(true)
      setStrategies(res.strategies || [])
    } catch {}
  }

  const loadStrategySummaries = async () => {
    const map: Record<number, any> = {}
    for (const s of strategies) {
      try {
        const res = await getStrategyBacktestSummary(s.id)
        if (res.has_backtest) map[s.id] = res
      } catch {}
    }
    setStrategySummary(map)
  }

  const loadRuns = async () => {
    setLoadingRuns(true)
    try {
      const res = await getBacktestRuns()
      setRuns(res.runs || [])
    } catch {}
    setLoadingRuns(false)
  }

  const loadRunDetail = async (id: number) => {
    try {
      const res = await getBacktestDetail(id)
      setCurrentRun(res)
    } catch {}
  }

  const loadTrades = async (id: number, page = 1, pageSize = 50) => {
    try {
      const res = await getBacktestTrades(id, page, pageSize)
      setTrades(res.trades || [])
      setTradesTotal(res.total || 0)
      setTradesPage(page)
      setTradesPageSize(pageSize)
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
        exit_rules: enabledRules.map((r) => {
          const { enabled, ...rule } = r
          return rule
        }),
      })
      if (res.run_id) {
        setSelectedRun(res.run_id)
        loadRunDetail(res.run_id)
        await loadTrades(res.run_id, 1, tradesPageSize)
        loadRuns()
      }
    } catch (err: any) {
      console.error('回测失败:', err)
    } finally {
      setRunning(false)
    }
  }

  const equityOption = () => {
    if (!currentRun?.daily_equity || currentRun.daily_equity.length === 0) return {}
    const data = currentRun.daily_equity
    const dates = data.map((d: any) => d.date.slice(5))
    const values = data.map((d: any) => d.equity)
    const colors = values.map((v: number) => v >= 0 ? '#cf1322' : '#389e0d')
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const d = data[params[0].dataIndex]
          return `<b>${d.date}</b><br/>累计收益: <b style="color:${d.equity >= 0 ? '#cf1322' : '#389e0d'}">${d.equity >= 0 ? '+' : ''}${d.equity.toFixed(2)}%</b>`
        },
      },
      grid: { left: '5%', right: '5%', top: '8%', bottom: '10%' },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: '{value}%' } },
      series: [{
        type: 'line', data: values, smooth: true, symbol: 'none',
        lineStyle: { width: 2, color: '#1677ff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(22,119,255,0.3)' },
              { offset: 1, color: 'rgba(22,119,255,0.02)' },
            ],
          },
        },
        markLine: {
          silent: true,
          data: [{ yAxis: 0, label: { formatter: '盈亏平衡线' }, lineStyle: { color: '#999', type: 'dashed' } }],
        },
      }],
    }
  }

  const regimeOption = () => {
    if (!currentRun?.regime_breakdown) return {}
    const data = currentRun.regime_breakdown
    const labels: Record<string, string> = {
      strong_bull: '强势上涨', weak_bull: '弱势上涨', sideways: '震荡',
      weak_bear: '弱势下跌', strong_bear: '强势下跌', unknown: '未知',
    }
    const colors: Record<string, string> = {
      strong_bull: '#cf1322', weak_bull: '#fa8c16', sideways: '#1677ff',
      weak_bear: '#389e0d', strong_bear: '#52c41a', unknown: '#999',
    }
    const keys = Object.keys(data).filter((k) => data[k].count > 0)
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '5%', right: '5%', top: '8%', bottom: '10%' },
      xAxis: {
        type: 'category',
        data: keys.map((k) => labels[k] || k),
      },
      yAxis: [
        { type: 'value', name: '胜率 %', max: 100, axisLabel: { formatter: '{value}%' } },
        { type: 'value', name: '平均收益 %', axisLabel: { formatter: '{value}%' } },
      ],
      series: [
        {
          name: '胜率', type: 'bar', data: keys.map((k) => data[k].win_rate),
          itemStyle: { color: (p: any) => colors[keys[p.dataIndex]] || '#1677ff' },
          yAxisIndex: 0,
          barWidth: '30%',
        },
        {
          name: '平均收益', type: 'bar', data: keys.map((k) => data[k].avg_return),
          itemStyle: {
            color: (p: any) => {
              const v = data[keys[p.dataIndex]].avg_return
              return v >= 0 ? '#cf1322' : '#389e0d'
            },
          },
          yAxisIndex: 1,
          barWidth: '30%',
        },
      ],
    }
  }

  const regimeColumns = [
    { title: '市场环境', dataIndex: 'name', key: 'name' },
    { title: '信号数', dataIndex: 'count', key: 'count' },
    { title: '胜率', dataIndex: 'winRate', key: 'winRate', render: (v: number) => <Text style={{ color: v >= 60 ? '#cf1322' : '#999' }}>{v}%</Text> },
    { title: '平均收益', dataIndex: 'avgReturn', key: 'avgReturn', render: (v: number) => <Text style={{ color: v >= 0 ? '#cf1322' : '#389e0d' }}>{v >= 0 ? '+' : ''}{v}%</Text> },
  ]

  const tradeColumns = [
    { title: '日期', dataIndex: 'signal_date', key: 'date', width: 100 },
    {
      title: '代码', dataIndex: 'stock_code', key: 'code', width: 90,
      render: (code: string) => (
        <a onClick={() => {
          savePageState({
            selectedStrategy, dateRange: [dateRange[0].format(), dateRange[1].format()],
            stockLimit, minScore, exitRules, selectedRun, currentRun, runs,
            trades, tradesTotal, tradesPage, tradesPageSize, strategies, strategySummary,
          })
          navigate(`/stock/${code}`)
        }} style={{ color: '#1677ff', cursor: 'pointer' }}>
          {code}
        </a>
      ),
    },
    { title: '名称', dataIndex: 'stock_name', key: 'name', width: 90 },
    {
      title: '入场', dataIndex: 'entry_price', key: 'entry', width: 80,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '收益', dataIndex: 'holding_return', key: 'return', width: 80,
      sorter: (a: any, b: any) => a.holding_return - b.holding_return,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#cf1322' : '#389e0d' }}>
          {v >= 0 ? '+' : ''}{v}%
        </Text>
      ),
    },
    {
      title: '最大回撤', dataIndex: 'max_drawdown', key: 'dd', width: 80,
      render: (v: number) => <Text style={{ color: '#fa8c16' }}>{v.toFixed(1)}%</Text>,
    },
    {
      title: '持有', dataIndex: 'hold_days', key: 'days', width: 60,
      render: (v: number) => `${v}天`,
    },
    {
      title: '退出原因', dataIndex: 'exit_reason', key: 'reason', width: 90,
      render: (v: string) => (
        <Tag color={EXIT_RULE_COLORS[v] || 'default'} style={{ fontSize: 11 }}>
          {EXIT_RULE_LABELS[v] || v}
        </Tag>
      ),
    },
    {
      title: '市场环境', dataIndex: 'regime', key: 'regime', width: 80,
      render: (v: string) => {
        const labels: Record<string, string> = {
          strong_bull: '强势↑', weak_bull: '弱势↑', sideways: '震荡→',
          weak_bear: '弱势↓', strong_bear: '强势↓', unknown: '-',
        }
        const colors: Record<string, string> = {
          strong_bull: '#cf1322', weak_bull: '#fa8c16', sideways: '#1677ff',
          weak_bear: '#389e0d', strong_bear: '#52c41a',
        }
        return <Tag color={colors[v] || 'default'} style={{ fontSize: 11 }}>{labels[v] || v}</Tag>
      },
    },
    {
      title: '评分', dataIndex: 'score', key: 'score', width: 60,
      render: (v: number) => <Text>{v}</Text>,
    },
  ]

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <BarChartOutlined style={{ marginRight: 8 }} />
            策略回测
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadRuns}>刷新历史</Button>
        </Col>
      </Row>

      {/* 回测配置 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col span={4}>
            <Text strong style={{ fontSize: 13 }}>选择策略</Text>
            <Select
              value={selectedStrategy}
              onChange={setSelectedStrategy}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择策略"
              options={strategies.map((s: any) => ({
                value: s.id,
                label: `${s.name}${strategySummary[s.id] ? ` (胜率${strategySummary[s.id].win_rate}%)` : ''}`,
              }))}
            />
          </Col>
          <Col span={5}>
            <Text strong style={{ fontSize: 13 }}>回测区间</Text>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]])
                }
              }}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col span={2}>
            <Text strong style={{ fontSize: 13 }}>扫描股票</Text>
            <InputNumber
              value={stockLimit}
              onChange={(v) => setStockLimit(v || 200)}
              min={50}
              max={5000}
              step={50}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col span={2}>
            <Text strong style={{ fontSize: 13 }}>最低评分</Text>
            <InputNumber
              value={minScore}
              onChange={(v) => setMinScore(v || 80)}
              min={0}
              max={100}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col span={8}>
            <Text strong style={{ fontSize: 13 }}>退出规则</Text>
            <Space style={{ marginTop: 4, flexWrap: 'wrap' }}>
              {exitRules.map((rule, idx) => (
                <Tag
                  key={rule.type}
                  color={rule.enabled ? 'blue' : 'default'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const copy = [...exitRules]
                    copy[idx] = { ...copy[idx], enabled: !copy[idx].enabled }
                    setExitRules(copy)
                  }}
                >
                  {EXIT_RULE_LABELS[rule.type] || rule.type}
                  {rule.enabled && rule.pct != null && ` ${rule.pct}%`}
                  {rule.enabled && rule.ma != null && ` MA${rule.ma}`}
                  {rule.enabled && rule.activate != null && ` ${rule.activate}%→${rule.pullback}%`}
                  {rule.enabled && rule.days != null && ` ${rule.days}天`}
                </Tag>
              ))}
            </Space>
          </Col>
          <Col span={3}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRun}
              loading={running}
              size="large"
              block
              disabled={!selectedStrategy}
              style={{ marginTop: 20 }}
            >
              运行回测
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 回测结果 */}
      {currentRun && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card size="small"><Statistic title="信号次数" value={currentRun.total_signals} suffix="次" /></Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="胜率"
                  value={currentRun.win_rate}
                  precision={1}
                  suffix="%"
                  valueStyle={{ color: currentRun.win_rate >= 50 ? '#cf1322' : '#389e0d' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="平均收益"
                  value={currentRun.avg_return}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: currentRun.avg_return >= 0 ? '#cf1322' : '#389e0d' }}
                  prefix={currentRun.avg_return >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="最大回撤" value={currentRun.max_drawdown} precision={1} suffix="%" valueStyle={{ color: '#fa8c16' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="盈亏比" value={currentRun.profit_loss_ratio} precision={2} valueStyle={{ color: currentRun.profit_loss_ratio >= 1.5 ? '#cf1322' : '#999' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic title="平均持有" value={currentRun.avg_hold_days} precision={1} suffix="天" />
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col span={14}>
              <Card size="small" title="累计收益曲线">
                <ReactECharts option={equityOption()} style={{ height: 260 }} />
              </Card>
            </Col>
            <Col span={10}>
              <Card size="small" title="按市场环境对比">
                <ReactECharts option={regimeOption()} style={{ height: 260 }} />
              </Card>
            </Col>
          </Row>

          {/* 市场环境表格 */}
          {currentRun.regime_breakdown && Object.keys(currentRun.regime_breakdown).length > 0 && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Table
                dataSource={Object.entries(currentRun.regime_breakdown)
                  .filter(([, v]: any) => v.count > 0)
                  .map(([k, v]: any) => ({
                    key: k, name: ({strong_bull: '强势上涨', weak_bull: '弱势上涨', sideways: '震荡', weak_bear: '弱势下跌', strong_bear: '强势下跌', unknown: '未知'} as any)[k] || k,
                    count: v.count, winRate: v.win_rate, avgReturn: v.avg_return,
                  }))}
                columns={regimeColumns}
                pagination={false}
                size="small"
              />
            </Card>
          )}

          {/* 交易明细 */}
          <Card
            size="small"
            title={<Space><HistoryOutlined />交易明细 ({tradesTotal} 笔)</Space>}
          >
            <Table
              dataSource={trades}
              columns={tradeColumns}
              rowKey="id"
              size="small"
              scroll={{ x: 900 }}
              pagination={{
                current: tradesPage,
                pageSize: tradesPageSize,
                total: tradesTotal,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100'],
                onChange: (p, ps) => {
                  if (selectedRun) loadTrades(selectedRun, p, ps)
                },
                onShowSizeChange: (_current, size) => {
                  if (selectedRun) loadTrades(selectedRun, 1, size)
                },
              }}
              expandable={{
                expandedRowRender: (record: any) => (
                  <div style={{ padding: '8px 0' }}>
                    <Text strong style={{ fontSize: 12 }}>逐日持仓日志：</Text>
                    <Table
                      dataSource={(record.daily_log || []).map((d: any, i: number) => ({ ...d, key: i }))}
                      columns={[
                        { title: '日', dataIndex: 'day', key: 'day', width: 50 },
                        { title: '日期', dataIndex: 'date', key: 'date', width: 100 },
                        { title: '收盘价', dataIndex: 'close', key: 'close', width: 80 },
                        {
                          title: '当日收益', dataIndex: 'return', key: 'return', width: 80,
                          render: (v: number) => (
                            <Text style={{ color: v >= 0 ? '#cf1322' : '#389e0d' }}>
                              {v >= 0 ? '+' : ''}{v}%
                            </Text>
                          ),
                        },
                        { title: 'MA5', dataIndex: 'ma5', key: 'ma5', width: 70, render: (v: any) => v ?? '-' },
                        { title: 'MA10', dataIndex: 'ma10', key: 'ma10', width: 70, render: (v: any) => v ?? '-' },
                      ]}
                      pagination={false}
                      size="small"
                    />
                  </div>
                ),
                rowExpandable: (record: any) => (record.daily_log || []).length > 0,
              }}
            />
          </Card>
        </>
      )}

      {!currentRun && !running && (
        <Card><Empty description="选择策略并点击「运行回测」开始" /></Card>
      )}

      <Divider />

      {/* 回测历史 */}
      <Collapse
        items={[{
          key: 'history',
          label: <Space><HistoryOutlined />回测历史 ({runs.length})</Space>,
          children: (
            <Table
              dataSource={runs}
              rowKey="id"
              size="small"
              pagination={false}
              loading={loadingRuns}
              columns={[
                { title: '策略', dataIndex: 'strategy_name', key: 'name' },
                { title: '区间', key: 'range', render: (_: any, r: any) => `${r.start_date} ~ ${r.end_date}` },
                { title: '信号', dataIndex: 'total_signals', key: 'signals' },
                { title: '胜率', dataIndex: 'win_rate', key: 'winrate', render: (v: number) => `${v}%` },
                { title: '平均收益', dataIndex: 'avg_return', key: 'avgreturn', render: (v: number) => `${v > 0 ? '+' : ''}${v}%` },
                { title: '最大回撤', dataIndex: 'max_drawdown', key: 'maxdd', render: (v: number) => `${v}%` },
                { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'done' ? 'green' : v === 'error' ? 'red' : 'processing'}>{v}</Tag> },
                {
                  title: '操作', key: 'action', render: (_: any, r: any) => (
                    <Button size="small" onClick={() => { setSelectedRun(r.id) }}>查看结果</Button>
                  ),
                },
              ]}
            />
          ),
        }]}
      />
    </div>
  )
}

export default Backtest
