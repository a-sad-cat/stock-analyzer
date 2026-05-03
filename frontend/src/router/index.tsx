import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from '../views/Dashboard'
import Strategies from '../views/Strategies'
import StockDetail from '../views/StockDetail'
import Results from '../views/Results'
import StockSearch from '../views/StockSearch'
import Sectors from '../views/Sectors'
import SectorDetail from '../views/SectorDetail'
import Backtest from '../views/Backtest'

const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/strategies" element={<Strategies />} />
      <Route path="/results" element={<Results />} />
      <Route path="/search" element={<StockSearch />} />
      <Route path="/sectors" element={<Sectors />} />
      <Route path="/sector/:name" element={<SectorDetail />} />
      <Route path="/backtest" element={<Backtest />} />
      <Route path="/stock/:code" element={<StockDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRouter
