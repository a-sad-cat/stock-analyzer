import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Typography, Space, Tag, Spin, Alert, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { getSectorDetail } from '../api'

const { Text } = Typography

function formatVol(v: number) {
  if (!v) return '0'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return v.toFixed(0)
}

const SectorDetail: React.FC = () => {
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sectorType = searchParams.get('type') || 'concept'

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    if (!name) return
    setLoading(true)
    getSectorDetail(decodeURIComponent(name), sectorType)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [name, sectorType])

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  if (!detail) return <Alert message="板块不存在" type="error" />

  const klineData = detail.kline?.slice(-120) || []
  const last = klineData[klineData.length - 1]
  const isUp = detail.pct_chg >= 0

  const klineOption = () => {
    if (!klineData.length) return {}
    const dates = klineData.map((d: any) => d.date)
    const ohlc = klineData.map((d: any) => [d.open, d.close, d.low, d.high])
    const volumes = klineData.map((d: any) => d.volume)
    const volColors = klineData.map((d: any) => d.close >= d.open ? '#f5222d' : '#52c41a')
    return {
      animation: true,
      animationDuration: 300,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [{ left: '3%', right: '3%', top: '5%', height: '56%' }, { left: '3%', right: '3%', top: '70%', height: '20%' }],
      xAxis: [
        { type: 'category', data: dates, axisTick: { show: false }, axisLabel: { fontSize: 10 }, gridIndex: 0 },
        { type: 'category', data: dates, axisTick: { show: false }, axisLabel: { show: false }, gridIndex: 1 },
      ],
      yAxis: [
        { type: 'value', scale: true, axisLabel: { fontSize: 10 }, gridIndex: 0 },
        { type: 'value', scale: true, axisLabel: { fontSize: 10, formatter: (v: number) => formatVol(v) }, gridIndex: 1 },
      ],
      series: [
        {
          name: 'K线', type: 'candlestick', data: ohlc,
          itemStyle: { color: '#f5222d', color0: '#52c41a', borderColor: '#f5222d', borderColor0: '#52c41a' },
          xAxisIndex: 0, yAxisIndex: 0,
        },
        {
          name: '成交量', type: 'bar', data: volumes,
          xAxisIndex: 1, yAxisIndex: 1,
          itemStyle: { color: (p: any) => volColors[p.dataIndex] },
        },
      ],
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <Button icon={<ArrowLeftOutlined />} size="small" onClick={() => navigate('/sectors')} style={{ marginBottom: 12 }}>
        返回
      </Button>

      {/* Info card */}
      <div
        className="card-mobile"
        style={{
          padding: '16px',
          marginBottom: 12,
          background: isUp
            ? 'linear-gradient(135deg, #fff1f0, #ffffff)'
            : 'linear-gradient(135deg, #f6ffed, #ffffff)',
        }}
      >
        <Space wrap style={{ marginBottom: 8 }} size={[4, 4]}>
          <Tag color={detail.sector_type === 'concept' ? 'purple' : 'blue'} style={{ fontSize: 12 }}>
            {detail.sector_type === 'concept' ? '概念板块' : '行业板块'}
          </Tag>
          <Text strong style={{ fontSize: 18 }}>{decodeURIComponent(name || '')}</Text>
          <Text style={{ fontSize: 12, color: '#999' }}>{detail.stock_count} 只成分股</Text>
        </Space>

        <div style={{ fontSize: 28, fontWeight: 700, color: isUp ? '#f5222d' : '#52c41a', marginBottom: 8 }}>
          {isUp ? '+' : ''}{detail.pct_chg?.toFixed(2) ?? '0.00'}%
        </div>

        {last && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[['今开', last.open?.toFixed(2)], ['最高', last.high?.toFixed(2)], ['最低', last.low?.toFixed(2)], ['成交量', formatVol(last.volume)]].map(([l, v]) => (
              <div key={l as string}>
                <div style={{ fontSize: 11, color: '#999' }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v ?? '-'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* K-line chart */}
      <div className="chart-box" style={{ padding: '12px 8px', marginBottom: 12 }}>
        <ReactECharts option={klineOption()} style={{ height: 280 }} />
      </div>

      {/* Stocks list */}
      {detail.stocks && detail.stocks.length > 0 && (
        <div className="card-mobile" style={{ padding: 16 }}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 10 }}>
            成分股（{detail.stocks.length} 只）
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.stocks.slice(0, 50).map((code: string) => (
              <Tag
                key={code}
                style={{ cursor: 'pointer', fontSize: 12, fontFamily: 'monospace', padding: '2px 8px' }}
                onClick={() => navigate(`/stock/${code}`)}
              >
                {code}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SectorDetail
