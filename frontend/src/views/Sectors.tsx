import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Space, Tag, Select, Alert } from 'antd'
import { FireOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { getSectorHeatmap } from '../api'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

const { Text } = Typography

const Sectors: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [sectors, setSectors] = useState<any[]>([])
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    getSectorHeatmap(typeFilter || undefined)
      .then((res) => setSectors(res.sectors || []))
      .catch(() => setSectors([]))
      .finally(() => setLoading(false))
  }, [typeFilter])

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FireOutlined style={{ fontSize: 18, color: '#fa541c' }} />
        <Text strong style={{ fontSize: 17 }}>板块热度</Text>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 120 }}
          size="small"
          options={[
            { value: '', label: '全部板块' },
            { value: 'concept', label: '概念板块' },
            { value: 'industry', label: '行业板块' },
          ]}
        />
        <Text style={{ fontSize: 12, color: '#999' }}>{sectors.length} 个板块</Text>
      </div>

      {/* Sector cards - 2 column grid */}
      {loading ? (
        <SkeletonCard count={4} />
      ) : sectors.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {sectors.map((s: any, i: number) => {
            const isUp = s.pct_chg >= 0
            return (
              <motion.div
                key={`${s.type}:${s.name}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/sector/${encodeURIComponent(s.name)}?type=${s.type}`)}
                style={{
                  background: isUp
                    ? 'linear-gradient(180deg, #fff1f0 0%, #ffffff 40%)'
                    : 'linear-gradient(180deg, #f6ffed 0%, #ffffff 40%)',
                  borderRadius: 12,
                  padding: '14px 12px',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag color={s.type === 'concept' ? 'purple' : 'blue'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                    {s.type === 'concept' ? '概念' : '行业'}
                  </Tag>
                  <Text strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </Text>
                </div>

                <div style={{ fontSize: 20, fontWeight: 700, color: isUp ? '#f5222d' : '#52c41a', marginBottom: 4 }}>
                  {isUp ? '+' : ''}{s.pct_chg.toFixed(2)}%
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Tag color={s.heat_score >= 80 ? 'red' : s.heat_score >= 60 ? 'orange' : 'default'} style={{ fontSize: 10, margin: 0 }}>
                    {s.heat_score}分
                  </Tag>
                  {s.limit_up_count > 0 && (
                    <Text style={{ fontSize: 11, color: '#999' }}>
                      涨停 {s.limit_up_count}
                    </Text>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <Alert message="暂无板块数据" type="info" />
      )}
    </div>
  )
}

export default Sectors
