import React, { useEffect, useState } from 'react'
import { Badge, Space, Typography } from 'antd'
import { SyncOutlined, MenuOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { runAllStrategies } from '../api'

const { Text } = Typography

interface HeaderBarProps {
  onMoreClick: () => void
}

const HeaderBar: React.FC<HeaderBarProps> = ({ onMoreClick }) => {
  const [currentTime, setCurrentTime] = useState(dayjs().format('HH:mm:ss'))
  const [isRunning, setIsRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [runCount, setRunCount] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs().format('HH:mm:ss'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleQuickScan = async () => {
    setIsRunning(true)
    try {
      const result = await runAllStrategies(0)
      setRunCount(result.total_matched || 0)
      setLastRun(dayjs().format('HH:mm:ss'))
    } catch {
      // silent
    } finally {
      setIsRunning(false)
    }
  }

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
        {!isRunning && lastRun && (
          <Badge
            status="success"
            text={
              <Text style={{ fontSize: 11, color: '#8e99a4' }}>
                {lastRun} · {runCount}只
              </Text>
            }
          />
        )}
        <div
          onClick={handleQuickScan}
          style={{
            height: 28,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            gap: 4,
            background: isRunning ? 'rgba(18,183,245,0.3)' : 'var(--color-primary)',
            color: '#fff',
            cursor: isRunning ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            opacity: isRunning ? 0.6 : 1,
          }}
        >
          <SyncOutlined style={{ fontSize: 11 }} spin={isRunning} />
          {isRunning ? '扫描中' : '扫描'}
        </div>
        <Text style={{ fontSize: 12, color: '#8e99a4', fontVariantNumeric: 'tabular-nums' }}>
          {currentTime}
        </Text>
      </Space>
    </div>
  )
}

export default HeaderBar
