import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Typography } from 'antd'
import {
  DashboardOutlined, FundOutlined, SearchOutlined,
  BarChartOutlined, RobotOutlined, FireOutlined,
  DeleteOutlined, StockOutlined,
} from '@ant-design/icons'

const { Text } = Typography

interface SidebarProps {
  onNavigate?: () => void
}

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/results', icon: <FundOutlined />, label: '扫描结果' },
  { key: '/llm', icon: <RobotOutlined />, label: 'AI 分析' },
  { key: '/backtest', icon: <BarChartOutlined />, label: '策略回测' },
  { key: '/search', icon: <SearchOutlined />, label: '搜索' },
  { key: '/sectors', icon: <FireOutlined />, label: '板块热度' },
  { key: '/admin', icon: <DeleteOutlined />, label: '清除缓存' },
]

const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = (() => {
    if (location.pathname.startsWith('/stock/')) return '/results'
    if (location.pathname.startsWith('/sector/')) return '/sectors'
    return location.pathname
  })()

  const handleClick = (key: string) => {
    navigate(key)
    onNavigate?.()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={() => { navigate('/'); onNavigate?.() }}
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid var(--color-border)',
          gap: 8,
        }}
      >
        <StockOutlined style={{ fontSize: 24, color: '#1677ff' }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>
          股票分析
        </span>
      </div>

      <div style={{ padding: '8px', flex: 1 }}>
        {menuItems.map((item) => {
          const active = item.key === selectedKey
          return (
            <div
              key={item.key}
              onClick={() => handleClick(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 10,
                marginBottom: 4,
                cursor: 'pointer',
                background: active ? '#e6f4ff' : 'transparent',
                color: active ? '#1677ff' : '#666',
                fontWeight: active ? 600 : 400,
                fontSize: 15,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
                {item.icon}
              </span>
              {item.label}
            </div>
          )
        })}
      </div>

      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--color-border)',
          textAlign: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: '#999' }}>v1.0.0 移动版</Text>
      </div>
    </div>
  )
}

export default Sidebar
