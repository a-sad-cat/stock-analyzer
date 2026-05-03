import React, { useEffect, useState } from 'react'
import { Layout, Drawer } from 'antd'
import AppRouter from './router'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import { useAppStore } from './stores/useAppStore'

const { Content, Sider } = Layout

const App: React.FC = () => {
  const collapsed = useAppStore((s) => s.collapsed)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 992)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const siderWidth = collapsed ? 80 : 220

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 桌面端侧边栏 */}
      {!isMobile && (
        <Sider
          width={220}
          collapsedWidth={80}
          collapsible
          collapsed={collapsed}
          trigger={null}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            overflow: 'auto',
          }}
        >
          <Sidebar />
        </Sider>
      )}

      {/* 移动端抽屉导航 */}
      <Drawer
        placement="left"
        closable={false}
        width={220}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      {/* 主内容区 */}
      <Layout style={{ marginLeft: isMobile ? 0 : siderWidth }}>
        <HeaderBar onToggleMenu={() => setDrawerOpen(!drawerOpen)} />
        <Content
          style={{
            margin: isMobile ? 12 : 24,
            minHeight: 'calc(100vh - 88px)',
          }}
        >
          <AppRouter />
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
