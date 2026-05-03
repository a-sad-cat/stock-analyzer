import React from 'react'
import { Layout } from 'antd'
import AppRouter from './router'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'

const { Content, Sider } = Layout

const App: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
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
      <Layout style={{ marginLeft: 220 }}>
        <HeaderBar />
        <Content style={{ margin: '24px', minHeight: 'calc(100vh - 88px)' }}>
          <AppRouter />
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
