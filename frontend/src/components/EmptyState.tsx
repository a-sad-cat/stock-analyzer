import React from 'react'
import { Empty, Button } from 'antd'

interface EmptyStateProps {
  description?: string
  actionText?: string
  onAction?: () => void
  icon?: React.ReactNode
}

const EmptyState: React.FC<EmptyStateProps> = ({
  description = '暂无数据',
  actionText,
  onAction,
  icon,
}) => {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      {icon ? (
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>{icon}</div>
      ) : (
        <Empty description={null} />
      )}
      <p style={{ color: '#999', fontSize: 14, marginBottom: 16 }}>{description}</p>
      {actionText && onAction && (
        <Button type="primary" onClick={onAction} size="middle">
          {actionText}
        </Button>
      )}
    </div>
  )
}

export default EmptyState
