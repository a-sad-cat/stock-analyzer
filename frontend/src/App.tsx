import React, { useState, useEffect, useRef } from 'react'
import { useLocation, Routes, Route } from 'react-router-dom'
import { Layout, Drawer } from 'antd'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import MobileTabs from './components/MobileTabs'

import Dashboard from './views/Dashboard'
import Strategies from './views/Strategies'
import StockDetail from './views/StockDetail'
import Results from './views/Results'
import StockSearch from './views/StockSearch'
import Sectors from './views/Sectors'
import SectorDetail from './views/SectorDetail'
import Backtest from './views/Backtest'
import AIAnalysis from './views/AIAnalysis'
import Admin from './views/Admin'

const { Content } = Layout
const TAB_HEIGHT = 64

// 5个主Tab路由：保持组件挂载，切换不丢状态
const TAB_ROUTES = ['/', '/results', '/llm', '/backtest', '/search']

const TAB_PAGES: Record<string, React.ReactNode> = {
  '/': <Dashboard />,
  '/results': <Results />,
  '/llm': <AIAnalysis />,
  '/backtest': <Backtest />,
  '/search': <StockSearch />,
}

const App: React.FC = () => {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 记录已访问过的Tab页（首次访问时才挂载，避免5个页面同时请求）
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['/']))

  useEffect(() => {
    if (TAB_ROUTES.includes(location.pathname)) {
      setMountedTabs(prev => {
        if (prev.has(location.pathname)) return prev
        return new Set([...prev, location.pathname])
      })
    }
  }, [location.pathname])

  return (
    <Layout style={{ minHeight: '100dvh', background: 'var(--color-bg-page)' }}>
      <HeaderBar onMoreClick={() => setDrawerOpen(true)} />

      <Drawer
        placement="left"
        closable={false}
        width={260}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <Content
        style={{
          margin: '0 12px',
          marginTop: 12,
          paddingBottom: TAB_HEIGHT + 22,
          paddingTop: 48,
        }}
      >
        {/* Tab 页：保持挂载，display 控制显隐 */}
        {TAB_ROUTES.map(route => (
          <div
            key={route}
            style={{ display: location.pathname === route ? 'block' : 'none' }}
          >
            {mountedTabs.has(route) ? TAB_PAGES[route] : null}
          </div>
        ))}

        {/* 非Tab页：正常路由，切换时卸载 */}
        {!TAB_ROUTES.includes(location.pathname) && (
          <Routes>
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/sectors" element={<Sectors />} />
            <Route path="/sector/:name" element={<SectorDetail />} />
            <Route path="/stock/:code" element={<StockDetail />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        )}
      </Content>

      <MobileTabs />
    </Layout>
  )
}

export default App
