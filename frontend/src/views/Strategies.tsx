import React, { useEffect, useState, useRef } from 'react'
import {
  Typography, Space, Tag, Button, Spin, message, Popconfirm,
  Modal, Form, Input, Select, Alert,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SyncOutlined,
  CheckCircleOutlined, AppstoreAddOutlined, SettingOutlined,
  ThunderboltOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getStrategies, deleteStrategy, createStrategy,
  toggleStrategy, getAvailableBuiltin, addBuiltinStrategy,
  getAllBuiltinStrategies, batchManageBuiltin, reorderStrategies,
} from '../api'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

const { Text } = Typography

const tagColors: Record<string, string> = {
  '适合短线': 'volcano', '适合抄底': 'green', '高胜率': 'gold',
  '强烈推荐': 'red', '强势突破': 'purple', '趋势确认': 'cyan',
  '趋势跟踪': 'geekblue', '稳健信号': 'lime', '高风险': 'orange',
  '左侧交易': 'magenta', '灵敏抄底': 'green', '强势股': 'red', '主升浪': 'blue',
}

const Strategies: React.FC = () => {
  const [strategies, setStrategies] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [addBuiltinOpen, setAddBuiltinOpen] = useState(false)
  const [availableBuiltin, setAvailableBuiltin] = useState<any[]>([])
  const [loadingBuiltin, setLoadingBuiltin] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [allBuiltin, setAllBuiltin] = useState<any[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [batchAction, setBatchAction] = useState<'add' | 'delete' | 'enable' | 'disable'>('add')
  const [form] = Form.useForm()

  useEffect(() => { loadStrategies() }, [])

  const loadStrategies = async () => {
    setLoading(true)
    try { const res = await getStrategies(true); setStrategies(res.strategies || []) } catch {} finally { setLoading(false) }
  }

  const handleToggle = async (id: number) => {
    try { await toggleStrategy(id); message.success('操作成功'); loadStrategies() } catch { message.error('操作失败') }
  }

  const handleDelete = async (id: number) => {
    try { await deleteStrategy(id); message.success('已移除'); loadStrategies(); if (selected?.id === id) setSelected(null) } catch { message.error('删除失败') }
  }

  const handleCreate = async (values: any) => {
    try {
      await createStrategy({
        name: values.name,
        description: values.description || '',
        config: { logic: values.logic || 'AND', conditions: [{ type: values.condition_type || 'price', operator: values.operator || '>', value: parseFloat(values.value) || 0, params: { period: parseInt(values.period) || 5 } }] },
      })
      message.success('创建成功'); setCreateOpen(false); form.resetFields(); loadStrategies()
    } catch { message.error('创建失败') }
  }

  const openAddBuiltin = async () => {
    setAddBuiltinOpen(true); setLoadingBuiltin(true)
    try { const res = await getAvailableBuiltin(); setAvailableBuiltin(res.strategies || []) } catch { setAvailableBuiltin([]) } finally { setLoadingBuiltin(false) }
  }

  const handleAddBuiltin = async (name: string) => {
    try { await addBuiltinStrategy(name); message.success('已添加'); setAddBuiltinOpen(false); loadStrategies() } catch { message.error('添加失败') }
  }

  const loadAllBuiltin = async () => {
    setLoadingAll(true)
    try { const res = await getAllBuiltinStrategies(); setAllBuiltin(res.strategies || []); setSelectedNames([]) } catch {} finally { setLoadingAll(false) }
  }

  const handleBatch = async () => {
    if (!selectedNames.length) { message.warning('请先选择'); return }
    try {
      const res = await batchManageBuiltin(selectedNames, batchAction)
      const ok = res.results.filter((r: any) => r.success).length
      message.success(`完成：${ok}/${selectedNames.length}`); setBatchOpen(false); loadStrategies()
    } catch { message.error('操作失败') }
  }

  const dragRef = useRef<number | null>(null)
  const handleDragDrop = async (targetId: number) => {
    const sourceId = dragRef.current
    if (sourceId == null || sourceId === targetId) return
    dragRef.current = null
    try {
      await reorderStrategies(sourceId, targetId)
      const copy = [...strategies]
      const si = copy.findIndex((s: any) => s.id === sourceId)
      const ti = copy.findIndex((s: any) => s.id === targetId)
      if (si >= 0 && ti >= 0) { [copy[si], copy[ti]] = [copy[ti], copy[si]]; setStrategies(copy) }
    } catch { message.error('排序失败') }
  }

  const enabledCount = strategies.filter((s: any) => s.enabled).length

  if (loading) return <div style={{ padding: '4px 0' }}><SkeletonCard count={3} /></div>

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text strong style={{ fontSize: 18 }}>策略简介</Text>
          <Space size={4}>
            <Button size="small" icon={<SettingOutlined />} onClick={() => { setBatchOpen(true); loadAllBuiltin() }}>批量</Button>
            <Button size="small" icon={<AppstoreAddOutlined />} onClick={openAddBuiltin}>添加</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建</Button>
            <Button size="small" onClick={loadStrategies} icon={<SyncOutlined />} />
          </Space>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Space size={4}>
            <Text style={{ fontSize: 12, color: '#8e99a4' }}>共 {strategies.length} 个</Text>
            <Text style={{ fontSize: 12, color: '#52c41a' }}><CheckCircleOutlined /> {enabledCount} 启用</Text>
          </Space>
          <Alert
            type="info"
            showIcon
            icon={<ClockCircleOutlined />}
            message="系统每天 0:00 / 17:00 自动扫描全市场，无需手动运行。结果请前往「扫描结果」查看。"
            style={{ fontSize: 12, borderRadius: 10, marginTop: 4 }}
            banner
          />
        </div>
      </div>

      {/* Strategy list */}
      <div style={{ marginBottom: 12 }}>
        {strategies.length === 0 ? (
          <EmptyState description="暂无策略" actionText="新建策略" onAction={() => setCreateOpen(true)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {strategies.map((item: any) => (
              <div
                key={item.id}
                draggable
                onClick={() => { setSelected(item) }}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragRef.current = item.id }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={(e) => { e.preventDefault(); handleDragDrop(item.id) }}
                style={{
                  background: selected?.id === item.id ? '#e0f7ff' : '#fff',
                  borderRadius: 14,
                  padding: '12px 14px',
                  cursor: 'grab',
                  border: selected?.id === item.id ? '1px solid rgba(18,183,245,0.3)' : '1px solid var(--color-border)',
                  borderLeft: selected?.id === item.id ? '3px solid var(--color-primary)' : '3px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: item.enabled ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
              >
                <Space style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: item.enabled ? '#52c41a' : '#d9d9d9',
                    flexShrink: 0,
                  }} />
                  <Text strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 14 }}>
                    {item.name}
                  </Text>
                  <Tag color={item.type === 'builtin' ? 'blue' : 'green'} style={{ fontSize: 10, margin: 0 }}>
                    {item.type === 'builtin' ? '内置' : '自定义'}
                  </Tag>
                </Space>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strategy detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="card-mobile" style={{ padding: 16, marginBottom: 12 }}>
              {/* Title row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <Text strong style={{ fontSize: 16 }}>{selected.name}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color={selected.type === 'builtin' ? 'blue' : 'green'} style={{ fontSize: 10 }}>{selected.type === 'builtin' ? '内置' : '自定义'}</Tag>
                    <Tag color={selected.enabled ? 'success' : 'default'} style={{ fontSize: 10 }}>{selected.enabled ? '已启用' : '已禁用'}</Tag>
                  </div>
                </div>
                <Space size={4}>
                  <Popconfirm title={selected.enabled ? '禁用？' : '启用？'} onConfirm={() => handleToggle(selected.id)}>
                    <Button size="small">{selected.enabled ? '禁用' : '启用'}</Button>
                  </Popconfirm>
                  <Popconfirm title="确认移除？" onConfirm={() => handleDelete(selected.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>

              {/* Description */}
              {selected.description ? (
                <Text style={{ fontSize: 13, color: '#333', display: 'block', marginBottom: 8, lineHeight: 1.6 }}>
                  {selected.description}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: '#8e99a4', display: 'block', marginBottom: 8 }}>
                  暂无描述
                </Text>
              )}

              {/* Tags */}
              {selected.tags && selected.tags.length > 0 && (
                <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selected.tags.map((tag: string) => (
                    <Tag key={tag} color={tagColors[tag] || 'default'} style={{ fontSize: 11 }}>{tag}</Tag>
                  ))}
                </div>
              )}

              {/* Last run info */}
              <div style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: '#8e99a4' }}>上次扫描：{selected.last_run || '从未运行'}</Text>
              </div>

              <Alert
                type={selected.enabled ? 'success' : 'warning'}
                showIcon
                message={selected.enabled ? '该策略已启用，每日定时扫描会使用此策略选股' : '该策略已禁用，定时扫描时将跳过此策略'}
                style={{ fontSize: 12, borderRadius: 10 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selected && !loading && strategies.length > 0 && (
        <div className="card-mobile" style={{ padding: 32, textAlign: 'center', borderRadius: 16 }}>
          <ThunderboltOutlined style={{ fontSize: 36, color: '#d9d9d9', marginBottom: 8 }} />
          <div style={{ color: '#8e99a4', fontSize: 13 }}>点击上方策略查看详情</div>
        </div>
      )}

      {/* Create modal (unchanged) */}
      <Modal title="新建策略" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} width="90%">
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="策略名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="简单描述" />
          </Form.Item>
          <Form.Item name="condition_type" label="条件类型" initialValue="price">
            <Select options={[
              { value: 'price', label: '价格条件' }, { value: 'ma', label: '均线条件' },
              { value: 'volume', label: '成交量条件' }, { value: 'macd', label: 'MACD条件' },
              { value: 'rsi', label: 'RSI条件' }, { value: 'kdj', label: 'KDJ条件' },
              { value: 'pct_chg', label: '涨幅条件' },
            ]} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Form.Item name="operator" label="比较" initialValue=">">
              <Select options={[{ value: '>', label: '>' }, { value: '>=', label: '>=' }, { value: '<', label: '<' }, { value: '<=', label: '<=' }, { value: 'cross_above', label: '上穿' }]} />
            </Form.Item>
            <Form.Item name="period" label="周期" initialValue="5">
              <Input type="number" placeholder="5" />
            </Form.Item>
            <Form.Item name="value" label="阈值" initialValue={0}>
              <Input type="number" step="0.01" />
            </Form.Item>
          </div>
          <Form.Item name="logic" label="逻辑" initialValue="AND">
            <Select options={[{ value: 'AND', label: '全部满足' }, { value: 'OR', label: '任一满足' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add builtin modal (unchanged) */}
      <Modal title="添加内置策略" open={addBuiltinOpen} onCancel={() => setAddBuiltinOpen(false)} footer={null} width="90%">
        {loadingBuiltin ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          : availableBuiltin.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}><CheckCircleOutlined style={{ fontSize: 36, color: '#52c41a' }} /><p>所有内置策略已在列表中</p></div>
          ) : (
            <div>
              {availableBuiltin.map((item: any) => (
                <div key={item.name} className="card-mobile" style={{ padding: '12px 14px', marginBottom: 6, borderRadius: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text strong>{item.name}</Text>
                      {item.tags && <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>{item.tags.map((t: string) => <Tag key={t} color={tagColors[t] || 'default'} style={{ fontSize: 10 }}>{t}</Tag>)}</div>}
                    </div>
                    <Button icon={<PlusOutlined />} size="small" onClick={() => handleAddBuiltin(item.name)}>添加</Button>
                  </div>
                </div>
              ))}
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Button type="dashed" icon={<SyncOutlined />} onClick={async () => {
                  for (const item of availableBuiltin) await addBuiltinStrategy(item.name)
                  message.success(`已恢复 ${availableBuiltin.length} 个`); setAddBuiltinOpen(false); loadStrategies()
                }}>一键恢复全部</Button>
              </div>
            </div>
          )}
      </Modal>

      {/* Batch modal (unchanged) */}
      <Modal title="批量管理" open={batchOpen} onCancel={() => setBatchOpen(false)} onOk={handleBatch} okText="确认" width="90%">
        <Space style={{ marginBottom: 12 }}>
          <Select value={batchAction} onChange={setBatchAction} style={{ width: 120 }} options={[
            { value: 'add', label: '添加' }, { value: 'delete', label: '移除' },
            { value: 'enable', label: '启用' }, { value: 'disable', label: '禁用' },
          ]} />
          <Button size="small" onClick={() => setSelectedNames(allBuiltin.map((s: any) => s.name))}>全选</Button>
          <Button size="small" onClick={() => setSelectedNames([])}>清空</Button>
        </Space>
        {loadingAll ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {allBuiltin.map((item: any) => {
              const sel = selectedNames.includes(item.name)
              const statusColor: Record<string, string> = { enabled: 'success', disabled: 'default', not_added: 'warning' }
              const statusLabel: Record<string, string> = { enabled: '已启用', disabled: '已禁用', not_added: '未添加' }
              return (
                <div key={item.name} onClick={() => setSelectedNames(prev => prev.includes(item.name) ? prev.filter(n => n !== item.name) : [...prev, item.name])}
                  style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 4, cursor: 'pointer', background: sel ? '#e0f7ff' : '#fff', border: sel ? '1px solid rgba(18,183,245,0.3)' : '1px solid var(--color-border)' }}>
                  <Space><Text strong>{item.name}</Text><Tag color={statusColor[item.status]}>{statusLabel[item.status]}</Tag></Space>
                  {item.description && <div style={{ fontSize: 12, color: '#8e99a4', marginTop: 2 }}>{item.description}</div>}
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Strategies
