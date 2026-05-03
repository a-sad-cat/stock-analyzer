import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Typography, Space, Tag, Row, Col, Spin, Alert, Select, Tooltip,
} from 'antd'
import {
  FireOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { getSectorHeatmap } from '../api'

const { Text } = Typography

const Sectors: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [sectors, setSectors] = useState<any[]>([])
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [typeFilter])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await getSectorHeatmap(typeFilter || undefined)
      setSectors(res.sectors || [])
    } catch {
      setSectors([])
    } finally {
      setLoading(false)
    }
  }

  const radarOption = (breakdown: any) => {
    const indicators = Object.entries(breakdown).map(([name, val]) => ({
      name, max: 25,
    }))
    return {
      radar: {
        indicator: indicators,
        center: ['50%', '50%'],
        radius: '60%',
      },
      series: [{
        type: 'radar',
        data: [{ value: Object.values(breakdown), name: '热度分解' }],
        areaStyle: { opacity: 0.2 },
        lineStyle: { width: 1.5 },
      }],
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <FireOutlined style={{ fontSize: 20, color: '#fa541c' }} />
          <Text strong style={{ fontSize: 16 }}>板块热度</Text>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 140 }}
            options={[
              { value: '', label: '全部板块' },
              { value: 'concept', label: '概念板块' },
              { value: 'industry', label: '行业板块' },
            ]}
          />
          <Text type="secondary">{sectors.length} 个板块</Text>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : sectors.length > 0 ? (
        <Row gutter={[12, 12]}>
          {sectors.map((s) => {
            const isUp = s.pct_chg >= 0
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={`${s.type}:${s.name}`}>
                <div
                  onClick={() => navigate(`/sector/${encodeURIComponent(s.name)}?type=${s.type}`)}
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                    padding: 14,
                    cursor: 'pointer',
                    border: '1px solid #f0f0f0',
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <Space style={{ marginBottom: 6 }}>
                    <Tag color={s.type === 'concept' ? 'purple' : 'blue'} style={{ fontSize: 11 }}>
                      {s.type === 'concept' ? '概念' : '行业'}
                    </Tag>
                    <Text strong style={{ fontSize: 14 }}>{s.name}</Text>
                  </Space>

                  <div style={{ marginBottom: 6 }}>
                    <Space>
                      <span style={{
                        fontSize: 18, fontWeight: 700,
                        color: isUp ? '#cf1322' : '#389e0d',
                      }}>
                        {isUp ? '+' : ''}{s.pct_chg.toFixed(2)}%
                      </span>
                      <Tag color={s.heat_score >= 80 ? 'red' : s.heat_score >= 60 ? 'orange' : 'default'}>
                        {s.heat_score}分
                      </Tag>
                    </Space>
                  </div>

                  {s.limit_up_count > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>涨停 {s.limit_up_count} 只</Text>
                    </div>
                  )}

                  {s.breakdown && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {Object.entries(s.breakdown as Record<string, number>).filter(([k]) => k !== '策略匹配').map(([k, v]) => (
                        <Tooltip key={k} title={`${k}: ${v}/满分`}>
                          <div style={{
                            fontSize: 10, background: '#f5f5f5', borderRadius: 4,
                            padding: '1px 6px', color: '#666',
                          }}>
                            {k} {v}
                          </div>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </div>
              </Col>
            )
          })}
        </Row>
      ) : (
        <Alert message="暂无板块数据" type="info" />
      )}
    </div>
  )
}

export default Sectors
