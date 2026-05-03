import React, { useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

const tabs = [
  {
    key: '/',
    label: '首页',
    icon: (active: boolean, color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 10L12 3l9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9z"
          stroke={color} strokeWidth="1.6" fill={active ? color : 'none'} fillOpacity={active ? 0.15 : 0} />
        <path d="M9 21V12h6v9" stroke={color} strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    key: '/search',
    label: '搜索',
    icon: (active: boolean, color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7.5" stroke={color} strokeWidth="1.6" />
        <path d="M16.5 16.5l5 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: '/sectors',
    label: '板块',
    icon: (active: boolean, color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="1.6"
          fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0} />
        <rect x="14" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="1.6"
          fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0} />
        <rect x="3" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth="1.6"
          fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0} />
        <rect x="14" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth="1.6"
          fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0} />
      </svg>
    ),
  },
  {
    key: '/strategies',
    label: '策略',
    icon: (active: boolean, color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          stroke={color} strokeWidth="1.6" fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}
          strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: '/results',
    label: '结果',
    icon: (active: boolean, color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={color} strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
]

const MobileTabs: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = tabs.find(
    (t) => location.pathname === t.key || (t.key !== '/' && location.pathname.startsWith(t.key))
  )?.key

  const lastActiveKey = useRef('/')
  if (activeKey) lastActiveKey.current = activeKey
  const highlightKey = activeKey || lastActiveKey.current

  return (
    <div
      className="safe-bottom"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderTop: '1px solid rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'flex-start',
        zIndex: 1000,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.key === highlightKey
        const color = active ? 'var(--color-primary)' : '#b0b8c1'
        return (
          <div
            key={tab.key}
            onClick={() => navigate(tab.key)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: 8,
              height: '100%',
              flex: 1,
              gap: 2,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <motion.div
              animate={{ scale: active ? 1 : 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active ? 'var(--color-primary)' : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              {tab.icon(active, active ? '#fff' : color)}
            </motion.div>
            <span
              style={{
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--color-primary)' : '#8e99a4',
                transition: 'color 0.2s',
              }}
            >
              {tab.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default MobileTabs
