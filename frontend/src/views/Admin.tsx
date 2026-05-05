import React, { useState } from 'react'
import { Typography, Button, message, Spin, Alert } from 'antd'
import { DeleteOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import axios from 'axios'

const { Text, Title } = Typography

const Admin: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ deleted: number; total_matched: number } | null>(null)

  const handleClearAndRescan = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await axios.post('/api/admin/clear-and-rescan', null, { timeout: 600000 })
      setResult({ deleted: res.data.deleted, total_matched: res.data.total_matched })
      message.success('清除并重新扫描完成！')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '操作失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, fontWeight: 600 }}>清除缓存</Title>
        <Text style={{ fontSize: 12, color: '#8e99a4' }}>管理今日扫描数据</Text>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<ClockCircleOutlined />}
        message={
          <div style={{ fontSize: 13 }}>
            <div>点击下方按钮将执行以下操作：</div>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
              <li>清空 <strong>今日</strong> 的策略扫描结果</li>
              <li>保留所有股票的日K线数据不删除</li>
              <li>仅扫描你在「策略简介」中 <strong>已启用</strong> 的策略</li>
            </ul>
          </div>
        }
        style={{ borderRadius: 12, marginBottom: 16 }}
      />

      <Button
        type="primary"
        danger
        size="large"
        block
        icon={loading ? <Spin size="small" /> : <DeleteOutlined />}
        onClick={handleClearAndRescan}
        loading={loading}
        style={{ height: 48, borderRadius: 14, fontSize: 15, fontWeight: 500, marginBottom: 16 }}
      >
        {loading ? '正在清除并重新扫描...' : '清除今日扫描结果并重新扫描'}
      </Button>

      {result && (
        <div
          style={{
            background: '#f6ffed',
            borderRadius: 14,
            padding: '14px 16px',
            border: '1px solid #b7eb8f',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
            <Text strong style={{ fontSize: 14, color: '#52c41a' }}>操作完成</Text>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <Text style={{ fontSize: 12, color: '#8e99a4' }}>已清除</Text>
              <div><Text strong style={{ fontSize: 18, color: '#ff4d4f' }}>{result.deleted}</Text><Text style={{ fontSize: 13, color: '#8e99a4' }}> 条</Text></div>
            </div>
            <div>
              <Text style={{ fontSize: 12, color: '#8e99a4' }}>本次匹配</Text>
              <div><Text strong style={{ fontSize: 18, color: '#1677ff' }}>{result.total_matched}</Text><Text style={{ fontSize: 13, color: '#8e99a4' }}> 只</Text></div>
            </div>
          </div>
          <Text style={{ fontSize: 12, color: '#8e99a4', display: 'block', marginTop: 6 }}>
            请前往「策略选股」页面查看最新扫描结果
          </Text>
        </div>
      )}
    </div>
  )
}

export default Admin
