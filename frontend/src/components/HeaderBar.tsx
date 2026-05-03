import React, { useEffect, useState } from 'react'
import { Layout, Badge, Space, Typography, Spin, Tooltip, Button } from 'antd'
import {
  SyncOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAppStore } from '../stores/useAppStore'
import { runAllStrategies } from '../api'

const { Header } = Layout
const { Text } = Typography

const HeaderBar: React.FC = () => {
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
        padding: '0 24px',
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
      {/* 左侧：标题 */}
      <Space>
        <Text strong style={{ fontSize: 16 }}>
          📊 A股短线策略分析工具
        </Text>
      </Space>

      {/* 右侧：状态 */}
      <Space size="large">
        {/* 运行状态 */}
        {isRunning ? (
          <Badge
            status="processing"
            text={
              <Text type="secondary">
                <Spin size="small" style={{ marginRight: 4 }} />
                正在扫描...
              </Text>
            }
          />
        ) : lastRun ? (
          <Badge
            status="success"
            text={
              <Text type="secondary" style={{ fontSize: 13 }}>
                上次扫描: {lastRun}，匹配 {runCount} 只
              </Text>
            }
          />
        ) : (
          <Badge status="default" text={<Text type="secondary">未扫描</Text>} />
        )}

        {/* 快速扫描按钮 */}
        <Tooltip title="快速扫描全市场（前200只股票）">
          <Button
            type="primary"
            size="small"
            icon={<SyncOutlined />}
            loading={isRunning}
            onClick={handleQuickScan}
          >
            快速扫描
          </Button>
        </Tooltip>

        {/* 时钟 */}
        <Space>
          <ClockCircleOutlined style={{ color: '#999' }} />
          <Text type="secondary">{currentTime}</Text>
        </Space>
      </Space>
    </Header>
  )
}

export default HeaderBar
