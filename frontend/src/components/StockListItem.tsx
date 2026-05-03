import React from 'react'
import { Tag, Typography } from 'antd'
import { motion } from 'framer-motion'

const { Text } = Typography

interface StockListItemProps {
  code: string
  name: string
  market?: string
  close?: number | null
  pctChg?: number | null
  score?: number
  reason?: string
  strategyName?: string
  matchCount?: number
  sectors?: string[]
  selected?: boolean
  extra?: React.ReactNode
  onClick?: () => void
  style?: React.CSSProperties
}

const StockListItem: React.FC<StockListItemProps> = ({
  code,
  name,
  market,
  close,
  pctChg,
  score,
  reason,
  strategyName,
  matchCount,
  sectors,
  selected,
  extra,
  onClick,
  style,
}) => {
  const isUp = pctChg != null && pctChg >= 0

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        background: selected ? '#e0f7ff' : '#fff',
        borderRadius: 14,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        border: selected ? '1px solid #91caff' : '1px solid var(--color-border)',
        transition: 'background 0.2s',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            {market && (
              <Tag color={market === 'SH' ? 'blue' : market === 'SZ' ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                {market}
              </Tag>
            )}
            <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#999' }}>{code}</Text>
            <Text strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </Text>
            {score != null && (
              <Text strong style={{ fontSize: 13, color: score >= 80 ? '#f5222d' : score >= 70 ? '#fa8c16' : '#1677ff' }}>
                {score}分
              </Text>
            )}
          </div>

          {reason && (
            <Text style={{ fontSize: 12, color: '#888' }} ellipsis>
              {reason.length > 40 ? reason.slice(0, 40) + '...' : reason}
            </Text>
          )}

          {strategyName && (
            <div style={{ marginTop: 4 }}>
              {matchCount && matchCount > 1 && (
                <Tag color="gold" style={{ fontSize: 10, margin: '0 4px 0 0', padding: '0 4px', lineHeight: '16px' }}>
                  {matchCount}
                </Tag>
              )}
              <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                {strategyName}
              </Tag>
            </div>
          )}

          {sectors && sectors.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {sectors.slice(0, 3).map((s) => (
                <Tag key={s} color="purple" style={{ fontSize: 10, margin: 0 }}>{s}</Tag>
              ))}
            </div>
          )}
        </div>

        {close != null && (
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: isUp ? '#f5222d' : '#52c41a' }}>
              {close.toFixed(2)}
            </div>
            {pctChg != null && (
              <div style={{ fontSize: 12, color: isUp ? '#f5222d' : '#52c41a' }}>
                {isUp ? '+' : ''}{pctChg.toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </div>

      {extra}
    </motion.div>
  )
}

export default StockListItem
