import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  Typography, Space, Tag, Row, Col, Spin, Alert, Button, Descriptions,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { getSectorDetail } from '../api'

const { Text } = Typography

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

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  if (!detail) {
    return <Alert message="板块不存在" type="error" />
  }

  const klineOption = () => {
    if (!detail.kline || detail.kline.length === 0) return {}
    const data = detail.kline.slice(-120)
    const dates = data.map((d: any) => d.date)
    const ohlc = data.map((d: any) => [d.open, d.close, d.low, d.high])
    const volumes = data.map((d: any) => d.volume)
    const volColors = data.map((d: any) => d.close >= d.open ? '#cf1322' : '#389e0d')
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [{ left: '5%', right: '5%', top: '8%', height: '55%' }, { left: '5%', right: '5%', top: '72%', height: '18%' }],
      xAxis: [
        { type: 'category', data: dates, axisLine: { onZero: false }, axisTick: { show: false }, gridIndex: 0 },
        { type: 'category', data: dates, gridIndex: 1, axisTick: { show: false }, axisLabel: { show: false } },
      ],
      yAxis: [{ type: 'value', scale: true, gridIndex: 0 }, { type: 'value', scale: true, gridIndex: 1 }],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: 80, end: 100 },
        { type: 'slider', xAxisIndex: [0, 1], start: 80, end: 100, bottom: 0 },
      ],
      series: [
        {
          name: 'K线', type: 'candlestick', data: ohlc,
          itemStyle: { color: '#cf1322', color0: '#389e0d', borderColor: '#cf1322', borderColor0: '#389e0d' },
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

  const isUp = detail.pct_chg >= 0

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sectors')} style={{ marginBottom: 12 }}>
        返回板块热度
      </Button>

      <div style={{ background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <Space style={{ marginBottom: 8 }}>
          <Tag color={detail.sector_type === 'concept' ? 'purple' : 'blue'} style={{ fontSize: 13 }}>
            {detail.sector_type === 'concept' ? '概念板块' : '行业板块'}
          </Tag>
          <Text strong style={{ fontSize: 20 }}>{decodeURIComponent(name || '')}</Text>
          <Text type="secondary">{detail.stock_count} 只成分股</Text>
        </Space>

        <div style={{ fontSize: 28, fontWeight: 700, color: isUp ? '#cf1322' : '#389e0d', marginBottom: 8 }}>
          {isUp ? '+' : ''}{detail.pct_chg?.toFixed(2) ?? '0.00'}%
        </div>

        {detail.kline && detail.kline.length > 0 && (
          <Descriptions size="small" column={4} style={{ marginBottom: 8 }}>
            <Descriptions.Item label="今开">{detail.kline[detail.kline.length-1]?.open?.toFixed(2) ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="最高">{detail.kline[detail.kline.length-1]?.high?.toFixed(2) ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="最低">{detail.kline[detail.kline.length-1]?.low?.toFixed(2) ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="成交量">{detail.kline[detail.kline.length-1]?.volume?.toFixed(0) ?? '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </div>

      {/* K 线图 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <ReactECharts option={klineOption()} style={{ height: Math.max(250, Math.min(400, window.innerHeight * 0.4)) }} />
      </div>

      {/* 成分股 */}
      {detail.stocks && detail.stocks.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 16 }}>
          <Text strong style={{ fontSize: 15, marginBottom: 8, display: 'block' }}>成分股（{detail.stocks.length} 只）</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.stocks.slice(0, 50).map((code: string) => (
              <Tag
                key={code}
                style={{ cursor: 'pointer', fontSize: 12, fontFamily: 'monospace' }}
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
