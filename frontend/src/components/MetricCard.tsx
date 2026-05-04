import React from 'react'
import { motion } from 'framer-motion'

interface MetricCardProps {
  title: string
  value: string | number
  suffix?: string
  color?: 'up' | 'down' | 'primary' | 'warning' | 'default'
  icon?: React.ReactNode
  subtitle?: string
  onClick?: () => void
  style?: React.CSSProperties
}

const gradientMap = {
  up: 'linear-gradient(135deg, #fff1f0 0%, #ffffff 50%)',
  down: 'linear-gradient(135deg, #f6ffed 0%, #ffffff 50%)',
  primary: 'linear-gradient(135deg, #e6f4ff 0%, #ffffff 50%)',
  warning: 'linear-gradient(135deg, #fff7e6 0%, #ffffff 50%)',
  default: '#ffffff',
}

const textColorMap = {
  up: '#f5222d',
  down: '#52c41a',
  primary: '#1677ff',
  warning: '#fa8c16',
  default: '#1f2937',
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  suffix,
  color = 'default',
  icon,
  subtitle,
  onClick,
  style,
}) => {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.97 } : undefined}
      onClick={onClick}
      style={{
        background: gradientMap[color],
        borderRadius: 12,
        padding: '14px 16px',
        border: '1px solid var(--color-border)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#999',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {icon && <span>{icon}</span>}
        {title}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: textColorMap[color],
          lineHeight: 1.3,
        }}
      >
        {value}
        {suffix && (
          <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>
            {suffix}
          </span>
        )}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </motion.div>
  )
}

export default MetricCard
