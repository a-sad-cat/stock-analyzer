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
  const hasOHLC = klineData.length > 0 && klineData[0].open != null && klineData[0].high != null

  const klineOption = () => {
    if (!klineData.length) return {}
    const dates = klineData.map((d: any) => d.date)

    if (hasOHLC) {
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

    // 降级折线图：只有收盘价数据
    const closes = klineData.map((d: any) => d.close)
    const chgColors = klineData.map((d: any) => (d.pct_chg ?? 0) >= 0 ? '#f5222d' : '#52c41a')
    return {
      animation: true,
      animationDuration: 300,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          if (!p) return ''
          const d = klineData[p.dataIndex]
          const chg = d?.pct_chg ?? 0
          const color = chg >= 0 ? '#f5222d' : '#52c41a'
          return `<div style="font-size:12px">${p.axisValue}<br/>收盘: <b style="color:${color}">${p.value?.toFixed(2)}</b></div>`
        },
      },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
      series: [{
        type: 'line', data: closes,
        lineStyle: { color: '#1677ff', width: 1.5 },
        itemStyle: { color: (p: any) => chgColors[p.dataIndex] },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(22,119,255,0.12)' }, { offset: 1, color: 'rgba(22,119,255,0.02)' }] } },
      }],
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
      <div className="card-mobile" style={{ padding: '12px 8px', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4, paddingLeft: 4 }}>
          近期走势{hasOHLC ? '（K线）' : '（收盘价）'}
        </Text>
        {klineData.length > 0 ? (
          <ReactECharts option={klineOption()} style={{ height: 280 }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 48, color: '#bbb', fontSize: 14 }}>
            暂无走势数据
          </div>
        )}
      </div>

      {/* Stocks list */}
      {detail.stocks && detail.stocks.length > 0 && (
        <div className="card-mobile" style={{ padding: 16 }}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 10 }}>
            成分股（{detail.stocks.length} 只） · 按涨幅降序
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {detail.stocks.slice(0, 50).map((s: any, i: number) => {
              const up = (s.pct_chg ?? 0) >= 0
              return (
                <div
                  key={s.code}
                  onClick={() => navigate(`/stock/${s.code}`)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '7px 8px',
                    borderRadius: 6, cursor: 'pointer',
                    background: i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(22,119,255,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent')}
                >
                  <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#999', width: 68, flexShrink: 0 }}>{s.code}</Text>
                  <Text style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Text>
                  <Text style={{ fontSize: 13, fontWeight: 600, color: up ? '#f5222d' : '#52c41a', width: 70, textAlign: 'right', flexShrink: 0 }}>
                    {s.pct_chg != null ? `${up ? '+' : ''}${s.pct_chg.toFixed(2)}%` : '-'}
                  </Text>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default SectorDetail
