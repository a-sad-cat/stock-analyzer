import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined, SearchOutlined, FireOutlined,
  AuditOutlined, FundOutlined,
} from '@ant-design/icons'

const tabs = [
  { key: '/', icon: <DashboardOutlined />, label: '首页' },
  { key: '/search', icon: <SearchOutlined />, label: '搜索' },
  { key: '/sectors', icon: <FireOutlined />, label: '板块' },
  { key: '/strategies', icon: <AuditOutlined />, label: '策略' },
  { key: '/results', icon: <FundOutlined />, label: '结果' },
]

const MobileTabs: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = tabs.find(t =>
    location.pathname === t.key ||
    (t.key !== '/' && location.pathname.startsWith(t.key))
  )?.key || '/'

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 56,
      background: '#fff',
      borderTop: '1px solid #f0f0f0',
      display: 'flex', alignItems: 'center',
      zIndex: 1000,
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
    }}>
      {tabs.map(tab => {
        const active = tab.key === activeKey
        return (
          <div
            key={tab.key}
            onClick={() => navigate(tab.key)}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', flex: 1, gap: 1,
              cursor: 'pointer',
              color: active ? '#1677ff' : '#999',
              fontSize: 10,
              transition: 'color 0.15s',
            }}
          >
            <span style={{
              fontSize: 22, lineHeight: 1,
              transform: active ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.15s',
            }}>
              {tab.icon}
            </span>
            <span style={{ fontWeight: active ? 500 : 400 }}>{tab.label}</span>
            {active && (
              <div style={{
                position: 'absolute', top: 0,
                width: 20, height: 2.5,
                background: '#1677ff',
                borderRadius: 2,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default MobileTabs
