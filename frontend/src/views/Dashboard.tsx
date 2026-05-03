import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Spin, Alert, Space, Button,
} from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined,
  FundOutlined, AuditOutlined, StockOutlined, ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { getMarketQuotes, getStrategies, getResults } from '../api'

const { Title, Text } = Typography

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [indices, setIndices] = useState<any[]>([])
  const [strategies, setStrategies] = useState<any[]>([])
  const [todayResults, setTodayResults] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) setLoading(true)
    try {
      const [quotesRes, strategiesRes, resultsRes] = await Promise.all([
        getMarketQuotes(forceRefresh).catch(() => ({ indices: [] })),
        getStrategies(forceRefresh).catch(() => ({ strategies: [] })),
        getResults(undefined, undefined, forceRefresh).catch(() => ({ results: [] })),
      ])
      setIndices(quotesRes.indices || [])
      setStrategies(strategiesRes.strategies || [])
      setTodayResults(resultsRes.results || [])
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 最新策略运行结果摘要
  const strategySummary = strategies
    .filter((s: any) => s.last_run)
    .map((s: any) => ({
      key: s.id,
      name: s.name,
      type: s.type === 'builtin' ? '内置' : '自定义',
      lastRun: s.last_run || '-',
      matched: todayResults.filter((r: any) => r.strategy_id === s.id).length,
    }))

  const topResults = [...todayResults]
    .filter((r: any) => r.score >= 80)
    .filter((r: any, i: number, arr: any[]) =>
      i === arr.findIndex((x: any) => x.stock_code === r.stock_code)
    )
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10)

  const resultColumns = [
    {
      title: '代码',
      dataIndex: 'stock_code',
      key: 'code',
      render: (code: string) => (
        <a onClick={() => navigate(`/stock/${code}`)} style={{ fontFamily: 'monospace' }}>
          {code}
        </a>
      ),
    },
    {
      title: '名称',
      dataIndex: 'stock_name',
      key: 'name',
    },
    {
      title: '策略',
      dataIndex: 'strategy_name',
      key: 'strategy',
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '评分',
      dataIndex: 'score',
      key: 'score',
      render: (score: number) => (
        <Text strong style={{ color: score >= 80 ? '#cf1322' : score >= 60 ? '#fa8c16' : '#1677ff' }}>
          {score}分
        </Text>
      ),
    },
  ]

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
        <p style={{ marginTop: 16, color: '#999' }}>正在加载数据...</p>
      </div>
    )
  }

  return (
    <div>
      {/* 标题栏 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FundOutlined style={{ marginRight: 8 }} />
            仪表盘
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => loadData(true)}>
            刷新数据
          </Button>
        </Col>
      </Row>

      {/* 大盘指数 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {indices.length > 0 ? indices.map((idx: any) => (
          <Col span={8} key={idx.name}>
            <Card hoverable>
              <Statistic
                title={idx.name}
                value={idx.close}
                precision={2}
                valueStyle={{ color: idx.pct_chg >= 0 ? '#cf1322' : '#389e0d' }}
                prefix={idx.pct_chg >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                suffix={
                  <span style={{ fontSize: 14 }}>
                    {idx.pct_chg >= 0 ? '+' : ''}{idx.pct_chg}%
                  </span>
                }
              />
            </Card>
          </Col>
        )) : (
          <Col span={24}>
            <Alert
              message="行情数据暂时无法获取（需要启动AKShare）"
              type="warning"
              showIcon
            />
          </Col>
        )}
      </Row>

      {/* 概览卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card hoverable className="hover-card">
            <Statistic
              title="策略总数"
              value={strategies.length}
              prefix={<AuditOutlined />}
              suffix={
                <Text type="secondary" style={{ fontSize: 14 }}>
                  内置{strategies.filter((s: any) => s.type === 'builtin').length}个
                </Text>
              }
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card hoverable className="hover-card">
            <Statistic
              title="今日匹配"
              value={todayResults.length}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: todayResults.length > 0 ? '#cf1322' : '#999' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card hoverable className="hover-card" onClick={() => navigate('/strategies')}>
            <Statistic
              title="最近运行策略"
              value={strategySummary.length}
              prefix={<FundOutlined />}
              suffix={
                <Button type="link" size="small">
                  查看策略
                </Button>
              }
            />
          </Card>
        </Col>
      </Row>

      {/* 最近策略运行 */}
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card
            title={<Space><AuditOutlined />策略运行状态</Space>}
            extra={<a onClick={() => navigate('/strategies')}>全部策略 →</a>}
          >
            {strategySummary.length > 0 ? (
              <Table
                dataSource={strategySummary}
                columns={[
                  { title: '策略名', dataIndex: 'name', key: 'name' },
                  {
                    title: '类型', dataIndex: 'type', key: 'type',
                    render: (t: string) => (
                      <Tag color={t === '内置' ? 'blue' : 'green'}>{t}</Tag>
                    ),
                  },
                  { title: '匹配数', dataIndex: 'matched', key: 'matched' },
                ]}
                pagination={false}
                size="small"
              />
            ) : (
              <Text type="secondary">暂无策略运行记录，去策略管理页运行一次吧</Text>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title={<Space><StockOutlined />最新信号</Space>}
            extra={<a onClick={() => navigate('/results')}>全部结果 →</a>}
          >
            {topResults.length > 0 ? (
              <Table
                dataSource={topResults}
                columns={resultColumns}
                pagination={false}
                size="small"
                rowKey="id"
              />
            ) : (
              <Text type="secondary">还没有扫描结果，点击右上角"快速扫描"按钮开始</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
