import React, { useEffect, useState } from 'react'
import { Layout, Drawer } from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import AppRouter from './router'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import MobileTabs from './components/MobileTabs'
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
  const TAB_BAR_HEIGHT = isMobile ? 56 : 0

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

      {/* 移动端底部导航 */}
      {isMobile && <MobileTabs />}

      {/* 移动端抽屉（回测等次要页面） */}
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
        <HeaderBar onMoreClick={() => setDrawerOpen(!drawerOpen)} />
        <Content
          style={{
            margin: isMobile ? 12 : 24,
            minHeight: 'calc(100vh - 88px)',
            paddingBottom: TAB_BAR_HEIGHT + 12,
          }}
        >
          <AppRouter />
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
