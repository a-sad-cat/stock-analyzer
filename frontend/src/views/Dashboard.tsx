import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Spin, Alert, Space } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, StockOutlined, ReloadOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { getMarketQuotes, getStrategies, getResults } from '../api'
import StockListItem from '../components/StockListItem'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

const { Text } = Typography

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [indices, setIndices] = useState<any[]>([])
  const [strategies, setStrategies] = useState<any[]>([])
  const [todayResults, setTodayResults] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true)
    try {
      const [quotesRes, strategiesRes, resultsRes] = await Promise.all([
        getMarketQuotes(forceRefresh).catch(() => ({ indices: [] })),
        getStrategies(forceRefresh).catch(() => ({ strategies: [] })),
        getResults(undefined, undefined, forceRefresh).catch(() => ({ results: [] })),
      ])
      setIndices(quotesRes.indices || [])
      setStrategies(strategiesRes.strategies || [])
      setTodayResults(resultsRes.results || [])
    } catch { /* silent */ } finally {
      setLoading(false)
      if (forceRefresh) setRefreshing(false)
    }
  }

  const enabledCount = strategies.filter((s: any) => s.enabled).length
  const topResults = [...todayResults]
    .filter((r: any) => r.score >= 80)
    .filter((r: any, i: number, arr: any[]) =>
      i === arr.findIndex((x: any) => x.stock_code === r.stock_code))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10)

  if (loading) {
    return (
      <div style={{ padding: '4px 0' }}>
        <SkeletonCard count={3} />
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Text strong style={{ fontSize: 18 }}>仪表盘</Text>
        <div
          onClick={() => !refreshing && loadData(true)}
          style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          background: refreshing ? 'rgba(18,183,245,0.15)' : 'var(--color-primary-light)',
            color: refreshing ? 'rgba(18,183,245,0.5)' : 'var(--color-primary)',
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          <ReloadOutlined style={{ fontSize: 14 }} spin={refreshing} />
        </div>
      </div>

      {/* Market Indices — single card 3-col grid */}
      {indices.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'linear-gradient(135deg, #e0f7ff 0%, #f5fdff 40%, #ffffff 100%)',
            borderRadius: 16,
            padding: '12px 10px',
            marginBottom: 14,
            border: '1px solid rgba(18,183,245,0.12)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
          }}
        >
          {indices.map((idx: any) => {
            const isUp = idx.pct_chg >= 0
            return (
              <div key={idx.name} style={{ textAlign: 'center', padding: '4px 0' }}>
                <div style={{ fontSize: 10, color: '#8e99a4', marginBottom: 2 }}>{idx.name}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isUp ? '#f5222d' : '#52c41a', lineHeight: 1.3 }}>
                  {idx.close?.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: isUp ? '#f5222d' : '#52c41a', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  {isUp ? <ArrowUpOutlined style={{ fontSize: 8 }} /> : <ArrowDownOutlined style={{ fontSize: 8 }} />}
                  {isUp ? '+' : ''}{idx.pct_chg}%
                </div>
              </div>
            )
          })}
        </motion.div>
      ) : (
        <Alert message="行情数据暂不可用" type="warning" showIcon style={{ marginBottom: 14, borderRadius: 12 }} />
      )}

      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <motion.div
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/strategies')}
          style={{
            flex: 1, background: '#fff', borderRadius: 14, padding: '12px 16px',
            border: '1px solid var(--color-border)', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: '#8e99a4' }}>策略</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>
            {strategies.length}<span style={{ fontSize: 12, fontWeight: 400, color: '#8e99a4', marginLeft: 2 }}>个</span>
          </div>
          <div style={{ fontSize: 10, color: '#b0b8c1', marginTop: 1 }}>{enabledCount} 已启用</div>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/results')}
          style={{
            flex: 1, background: '#fff', borderRadius: 14, padding: '12px 16px',
            border: '1px solid var(--color-border)', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: '#8e99a4' }}>今日匹配</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: todayResults.length > 0 ? '#f5222d' : '#b0b8c1' }}>
            {todayResults.length}<span style={{ fontSize: 12, fontWeight: 400, color: '#8e99a4', marginLeft: 2 }}>条</span>
          </div>
          <div style={{ fontSize: 10, color: '#b0b8c1', marginTop: 1 }}>高分信号</div>
        </motion.div>
      </div>

      {/* Latest signals */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 15 }}>
            <StockOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
            最新信号
          </Text>
          <Text
            onClick={() => navigate('/results')}
            style={{ fontSize: 12, color: 'var(--color-primary)', cursor: 'pointer' }}
          >
            查看全部 →
          </Text>
        </div>

        {topResults.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topResults.map((r: any, i: number) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <StockListItem
                  code={r.stock_code}
                  name={r.stock_name}
                  score={r.score}
                  strategyName={r.strategy_name}
                  reason={r.reason}
                  onClick={() => navigate(`/stock/${r.stock_code}`)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            description="还没有扫描结果"
            actionText="去策略管理"
            onAction={() => navigate('/strategies')}
          />
        )}
      </div>
    </div>
  )
}

export default Dashboard
