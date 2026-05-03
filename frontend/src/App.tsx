import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Layout, Drawer } from 'antd'
import { AnimatePresence, motion } from 'framer-motion'
import AppRouter from './router'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import MobileTabs from './components/MobileTabs'

const { Content } = Layout
const TAB_HEIGHT = 64

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const App: React.FC = () => {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

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
          paddingBottom: TAB_HEIGHT + 16,
          paddingTop: 48,
        }}
      >
        <AnimatePresence mode="sync">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <AppRouter />
          </motion.div>
        </AnimatePresence>
      </Content>

      <MobileTabs />
    </Layout>
  )
}

export default App
