import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Strategies from '../views/Strategies'
import StockDetail from '../views/StockDetail'
import Sectors from '../views/Sectors'
import SectorDetail from '../views/SectorDetail'
import Admin from '../views/Admin'

const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/strategies" element={<Strategies />} />
      <Route path="/sectors" element={<Sectors />} />
      <Route path="/sector/:name" element={<SectorDetail />} />
      <Route path="/stock/:code" element={<StockDetail />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRouter
