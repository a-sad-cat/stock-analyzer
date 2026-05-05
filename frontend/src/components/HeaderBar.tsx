import React, { useEffect, useState } from 'react'
import { Space, Typography } from 'antd'
import { MenuOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Text } = Typography

interface HeaderBarProps {
  onMoreClick: () => void
}

const HeaderBar: React.FC<HeaderBarProps> = ({ onMoreClick }) => {
  const [currentTime, setCurrentTime] = useState(dayjs().format('HH:mm:ss'))

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs().format('HH:mm:ss'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className="glass"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 1000,
        borderBottom: '1px solid rgba(0,0,0,0.03)',
      }}
    >
      <Space size={8}>
        <div
          onClick={onMoreClick}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8e99a4',
            cursor: 'pointer',
          }}
        >
          <MenuOutlined style={{ fontSize: 18 }} />
        </div>
        <Text strong style={{ fontSize: 16, color: '#1f2937' }}>
          股票分析
        </Text>
      </Space>

      <Space size={6}>
        <ClockCircleOutlined style={{ fontSize: 12, color: '#8e99a4' }} />
        <Text style={{ fontSize: 12, color: '#8e99a4', fontVariantNumeric: 'tabular-nums' }}>
          {currentTime}
        </Text>
      </Space>
    </div>
  )
}

export default HeaderBar
