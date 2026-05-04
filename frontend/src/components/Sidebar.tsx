import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu } from 'antd'
import {
  DashboardOutlined, FundOutlined, AuditOutlined, StockOutlined,
  SearchOutlined, FireOutlined, BarChartOutlined, RobotOutlined,
} from '@ant-design/icons'

interface SidebarProps {
  onNavigate?: () => void
}

const menuItems = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: '仪表盘',
  },
  {
    key: '/search',
    icon: <SearchOutlined />,
    label: '股票搜索',
  },
  {
    key: '/sectors',
    icon: <FireOutlined />,
    label: '板块热度',
  },
  {
    key: '/strategies',
    icon: <AuditOutlined />,
    label: '策略管理',
  },
  {
    key: '/results',
    icon: <FundOutlined />,
    label: '扫描结果',
  },
  {
    key: '/backtest',
    icon: <BarChartOutlined />,
    label: '策略回测',
  },
  {
    key: '/llm',
    icon: <RobotOutlined />,
    label: 'AI 分析',
  },
]

const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = location.pathname.startsWith('/stock/')
    ? '/results'
    : location.pathname

  const handleClick = ({ key }: { key: string }) => {
    navigate(key)
    onNavigate?.()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0',
          cursor: 'pointer',
        }}
        onClick={() => { navigate('/'); onNavigate?.() }}
      >
        <StockOutlined style={{ fontSize: 24, color: '#1677ff', marginRight: 8 }} />
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1677ff' }}>
          股票分析
        </span>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={handleClick}
        style={{ borderRight: 'none', flex: 1 }}
      />

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #f0f0f0',
          fontSize: 12,
          color: '#999',
          textAlign: 'center',
        }}
      >
        v1.0.0 短线策略版
      </div>
    </div>
  )
}

export default Sidebar
