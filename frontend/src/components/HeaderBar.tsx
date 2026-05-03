import React, { useEffect, useState } from 'react'
import { Layout, Badge, Space, Typography, Spin, Tooltip, Button } from 'antd'
import {
  SyncOutlined,
  ClockCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAppStore } from '../stores/useAppStore'
import { runAllStrategies } from '../api'

const { Header } = Layout
const { Text } = Typography

interface HeaderBarProps {
  onToggleMenu: () => void
}

const HeaderBar: React.FC<HeaderBarProps> = ({ onToggleMenu }) => {
  const [currentTime, setCurrentTime] = useState(dayjs().format('HH:mm:ss'))
  const [isRunning, setIsRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [runCount, setRunCount] = useState(0)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992)
  const collapsed = useAppStore((s) => s.collapsed)
  const toggleCollapsed = useAppStore((s) => s.toggleCollapsed)

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
      const result = await runAllStrategies(200)
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
        padding: isMobile ? '0 12px' : '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        height: 64,
        position: 'sticky',
        top: 0,
        zIndex: 99,
      }}
    >
      {/* 左侧：菜单按钮 + 标题 */}
      <Space>
        <Button
          type="text"
          icon={collapsed || isMobile ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => { if (isMobile) onToggleMenu(); else toggleCollapsed() }}
          style={{ fontSize: 18, width: 40, height: 40 }}
        />
        {!isMobile && (
          <Text strong style={{ fontSize: 16 }}>
            📊 A股短线策略分析工具
          </Text>
        )}
        {isMobile && (
          <Text strong style={{ fontSize: 15 }}>
            股票分析
          </Text>
        )}
      </Space>

      {/* 右侧：状态 */}
      <Space size={isMobile ? "small" : "large"}>
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

        <Tooltip title="快速扫描全市场（前200只股票）">
          <Button
            type="primary"
            size={isMobile ? "small" : "small"}
            icon={<SyncOutlined />}
            loading={isRunning}
            onClick={handleQuickScan}
          >
            {isMobile ? '扫描' : '快速扫描'}
          </Button>
        </Tooltip>

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
