import React, { useEffect, useState } from 'react'
import { Layout, Badge, Space, Typography, Spin, Tooltip, Button } from 'antd'
import {
  SyncOutlined,
  ClockCircleOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { runAllStrategies } from '../api'

const { Header } = Layout
const { Text } = Typography

interface HeaderBarProps {
  onMoreClick: () => void
}

const HeaderBar: React.FC<HeaderBarProps> = ({ onMoreClick }) => {
  const [currentTime, setCurrentTime] = useState(dayjs().format('HH:mm:ss'))
  const [isRunning, setIsRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [runCount, setRunCount] = useState(0)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
      const total = result.total_matched || 0
      setRunCount(total)
      setLastRun(dayjs().format('HH:mm:ss'))
    } catch (err) {
      console.error('扫描失败:', err)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Header
      style={{
        background: '#fff',
        padding: isMobile ? '0 8px' : '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 99,
      }}
    >
      {/* 左侧：标题 */}
      <Text strong style={{ fontSize: isMobile ? 16 : 17 }}>
        {isMobile ? '股票分析' : '📊 A股短线策略分析工具'}
      </Text>

      {/* 右侧 */}
      <Space size={isMobile ? 4 : "large"}>
        {!isRunning && lastRun && !isMobile && (
          <Badge
            status="success"
            text={
              <Text type="secondary" style={{ fontSize: 13 }}>
                上次扫描: {lastRun}，匹配 {runCount} 只
              </Text>
            }
          />
        )}

        <Tooltip title="全市场扫描">
          <Button
            type="primary"
            size={isMobile ? "small" : "small"}
            icon={<SyncOutlined />}
            loading={isRunning}
            onClick={handleQuickScan}
          >
            {isMobile ? '' : '快速扫描'}
          </Button>
        </Tooltip>

        {isMobile && (
          <div
            onClick={onMoreClick}
            style={{
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8,
              cursor: 'pointer',
              color: '#666',
            }}
          >
            <MenuOutlined style={{ fontSize: 20 }} />
          </div>
        )}

        {!isMobile && (
          <Space>
            <ClockCircleOutlined style={{ color: '#999' }} />
            <Text type="secondary">{currentTime}</Text>
          </Space>
        )}
      </Space>
    </Header>
  )
}

export default HeaderBar
