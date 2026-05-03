import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, List, Tag, Typography, Button, Space, Modal, Form,
  Input, Select, Spin, message, Descriptions, Divider, Alert, Switch,
  Tooltip, Popconfirm, Badge, Empty, Tabs, Table,
} from 'antd'
import {
  PlayCircleOutlined, PlusOutlined, DeleteOutlined, ThunderboltOutlined,
  TagsOutlined, InfoCircleOutlined, MinusCircleOutlined, SyncOutlined,
  FundOutlined, AuditOutlined, CheckCircleOutlined, StopOutlined,
  ReloadOutlined, AppstoreAddOutlined, SettingOutlined,
} from '@ant-design/icons'
import {
  getStrategies, runStrategy, deleteStrategy, createStrategy,
  toggleStrategy, getAvailableBuiltin, addBuiltinStrategy,
  getAllBuiltinStrategies, batchManageBuiltin, reorderStrategies,
} from '../api'

const { Title, Text, Paragraph } = Typography

// 策略类型对应的颜色
const typeColors: Record<string, string> = {
  builtin: 'blue',
  custom: 'green',
}

const typeLabels: Record<string, string> = {
  builtin: '内置策略',
  custom: '自定义',
}

const tagColors: Record<string, string> = {
  '适合短线': 'volcano',
  '适合抄底': 'green',
  '高胜率': 'gold',
  '强烈推荐': 'red',
  '强势突破': 'purple',
  '趋势确认': 'cyan',
  '趋势跟踪': 'geekblue',
  '稳健信号': 'lime',
  '高风险': 'orange',
  '左侧交易': 'magenta',
  '灵敏抄底': 'green',
  '强势股': 'red',
  '主升浪': 'blue',
}

const Strategies: React.FC = () => {
  const navigate = useNavigate()
  const [strategies, setStrategies] = useState<any[]>([])
  const [selectedStrategy, setSelectedStrategy] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<number | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)
  const [runResults, setRunResults] = useState<any[] | null>(null)
  const [showHighScore, setShowHighScore] = useState(true)

  // 新建策略弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [form] = Form.useForm()

  // 添加内置策略弹窗
  const [addBuiltinOpen, setAddBuiltinOpen] = useState(false)
  const [availableBuiltin, setAvailableBuiltin] = useState<any[]>([])
  const [loadingBuiltin, setLoadingBuiltin] = useState(false)

  // 批量管理弹窗
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [allBuiltinStrategies, setAllBuiltinStrategies] = useState<any[]>([])
  const [loadingAllBuiltin, setLoadingAllBuiltin] = useState(false)
  const [selectedBuiltinNames, setSelectedBuiltinNames] = useState<string[]>([])
  const [batchAction, setBatchAction] = useState<'add' | 'delete' | 'enable' | 'disable'>('add')

  useEffect(() => {
    loadStrategies()
  }, [])

  const loadStrategies = async () => {
    setLoading(true)
    try {
      const res = await getStrategies(true)
      setStrategies(res.strategies || [])
    } catch (err) {
      console.error('加载策略失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRun = async (id: number) => {
    setRunning(id)
    setRunResults(null)
    try {
      const res = await runStrategy(id)
      message.success(`扫描完成！匹配 ${res.count} 只股票`)
      setRunResults(res.results || [])
    } catch (err) {
      message.error('扫描失败')
    } finally {
      setRunning(null)
    }
  }

  const handleToggle = async (id: number) => {
    setToggling(id)
    try {
      const res = await toggleStrategy(id)
      message.success(res.message)
      loadStrategies()
    } catch (err) {
      message.error('操作失败')
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await deleteStrategy(id)
      message.success(res.message || '策略已移除')
      loadStrategies()
      if (selectedStrategy?.id === id) setSelectedStrategy(null)
    } catch (err) {
      message.error('删除失败')
    }
  }

  const handleCreate = async (values: any) => {
    try {
      const config = {
        logic: values.logic || 'AND',
        conditions: [
          {
            type: values.condition_type || 'price',
            operator: values.operator || '>',
            value: parseFloat(values.value) || 0,
            params: { period: parseInt(values.period) || 5 },
          },
        ],
      }
      await createStrategy({
        name: values.name,
        description: values.description || '',
        config,
      })
      message.success('策略创建成功')
      setCreateModalOpen(false)
      form.resetFields()
      loadStrategies()
    } catch (err) {
      message.error('创建失败')
    }
  }

  const openAddBuiltin = async () => {
    setAddBuiltinOpen(true)
    setLoadingBuiltin(true)
    try {
      const res = await getAvailableBuiltin()
      setAvailableBuiltin(res.strategies || [])
    } catch (err) {
      message.error('获取可用策略失败')
      setAvailableBuiltin([])
    } finally {
      setLoadingBuiltin(false)
    }
  }

  const handleAddBuiltin = async (name: string) => {
    try {
      const res = await addBuiltinStrategy(name)
      message.success(res.message)
      setAddBuiltinOpen(false)
      loadStrategies()
    } catch (err) {
      message.error('添加失败')
    }
  }

  const loadAllBuiltinStrategies = async () => {
    setLoadingAllBuiltin(true)
    try {
      const res = await getAllBuiltinStrategies()
      setAllBuiltinStrategies(res.strategies || [])
      setSelectedBuiltinNames([])
      setBatchAction('add')
    } catch (err) {
      message.error('加载失败')
    } finally {
      setLoadingAllBuiltin(false)
    }
  }

  const handleBatchManage = async () => {
    if (selectedBuiltinNames.length === 0) {
      message.warning('请先选择策略')
      return
    }
    try {
      const res = await batchManageBuiltin(selectedBuiltinNames, batchAction)
      const successCount = res.results.filter((r: any) => r.success).length
      const actionLabels: Record<string, string> = { add: '添加', delete: '移除', enable: '启用', disable: '禁用' }
      message.success(`${actionLabels[batchAction]}完成：${successCount}/${selectedBuiltinNames.length}`)
      setBatchModalOpen(false)
      loadStrategies()
    } catch (err) {
      message.error('批量操作失败')
    }
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
      if (si >= 0 && ti >= 0) {
        [copy[si], copy[ti]] = [copy[ti], copy[si]]
        setStrategies(copy)
      }
    } catch {
      message.error('排序失败')
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  const enabledCount = strategies.filter((s: any) => s.enabled).length
  const disabledCount = strategies.length - enabledCount

  return (
    <div>
      {/* 标题栏 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <AuditOutlined style={{ marginRight: 8 }} />
            策略管理
          </Title>
          <Space split={<Text type="secondary">|</Text>}>
            <Text type="secondary">共 {strategies.length} 个策略</Text>
            <Text type="success">
              <CheckCircleOutlined /> {enabledCount} 个已启用
            </Text>
            {disabledCount > 0 && (
              <Text type="danger">
                <StopOutlined /> {disabledCount} 个已禁用
              </Text>
            )}
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => {
              setBatchModalOpen(true)
              loadAllBuiltinStrategies()
            }}>
              批量管理
            </Button>
            <Button icon={<AppstoreAddOutlined />} onClick={openAddBuiltin}>
              添加内置策略
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              新建自定义策略
            </Button>
            <Button onClick={loadStrategies} icon={<SyncOutlined />}>
              刷新
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 策略列表 */}
        <Col span={6}>
          <Card
            style={{ height: 'calc(100vh - 200px)', overflow: 'auto' }}
            bodyStyle={{ padding: 0 }}
          >
            <List
              dataSource={strategies}
              renderItem={(item: any) => (
                <div
                  key={item.id}
                  draggable
                  onClick={() => setSelectedStrategy(item)}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragRef.current = item.id }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                  onDragEnter={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = '#f0f5ff' }}
                  onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selectedStrategy?.id === item.id ? '#f5f9ff' : 'transparent' }}
                  onDrop={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = selectedStrategy?.id === item.id ? '#f5f9ff' : 'transparent'; handleDragDrop(item.id) }}
                  style={{
                    cursor: 'grab',
                    padding: '10px 14px',
                    borderLeft: selectedStrategy?.id === item.id ? '3px solid #1677ff' : '3px solid transparent',
                    background: selectedStrategy?.id === item.id ? '#f5f9ff' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                    opacity: item.enabled ? 1 : 0.5,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                  }}
                >
                  <Space style={{ minWidth: 0, flex: 1 }}>
                    <Badge status={item.enabled ? 'success' : 'default'} />
                    <Text
                      strong
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 13,
                      }}
                    >
                      {item.name}
                    </Text>
                  </Space>
                </div>
              )}
            />
          </Card>
        </Col>

        {/* 策略详情 */}
        <Col span={18}>
          {selectedStrategy ? (
            <Card
              title={
                <Space>
                  <AuditOutlined style={{ color: '#1677ff' }} />
                  <Text strong style={{ fontSize: 16 }}>{selectedStrategy.name}</Text>
                  <Tag color={typeColors[selectedStrategy.type]} style={{ fontSize: 11 }}>
                    {typeLabels[selectedStrategy.type]}
                  </Tag>
                  <Tag color={selectedStrategy.enabled ? 'success' : 'default'} style={{ fontSize: 11 }}>
                    {selectedStrategy.enabled ? '已启用' : '已禁用'}
                  </Tag>
                </Space>
              }
              extra={
                <Space>
                  {selectedStrategy.enabled ? (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      loading={running === selectedStrategy.id}
                      onClick={() => handleRun(selectedStrategy.id)}
                    >
                      {running === selectedStrategy.id ? '扫描中...' : '运行策略'}
                    </Button>
                  ) : (
                    <Tooltip title="策略禁用时无法运行，请先启用">
                      <Button type="primary" icon={<PlayCircleOutlined />} disabled>
                        运行策略
                      </Button>
                    </Tooltip>
                  )}

                  <Popconfirm
                    title={
                      selectedStrategy.enabled
                        ? `确定禁用「${selectedStrategy.name}」？`
                        : `确定启用「${selectedStrategy.name}」？`
                    }
                    onConfirm={() => handleToggle(selectedStrategy.id)}
                  >
                    <Button
                      icon={selectedStrategy.enabled ? <StopOutlined /> : <CheckCircleOutlined />}
                    >
                      {selectedStrategy.enabled ? '禁用' : '启用'}
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title={
                      selectedStrategy.type === 'builtin'
                        ? `移除非首次创建的内置策略「${selectedStrategy.name}」？`
                        : `确定删除「${selectedStrategy.name}」？（不可恢复）`
                    }
                    onConfirm={() => handleDelete(selectedStrategy.id)}
                  >
                    <Button danger icon={<MinusCircleOutlined />}>
                      移除
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
              <Row gutter={[16, 16]}>
                <Col span={16}>
                  <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="描述">
                      {selectedStrategy.description || '暂无描述'}
                    </Descriptions.Item>
                  </Descriptions>

                  {/* 标签 */}
                  {selectedStrategy.tags && selectedStrategy.tags.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>标签</Text>
                      <div style={{ marginTop: 4 }}>
                        {selectedStrategy.tags.map((tag: string) => (
                          <Tag key={tag} color={tagColors[tag] || 'default'} style={{ fontSize: 12, marginBottom: 4 }}>
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </Col>
                <Col span={8}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="类型">
                      <Tag color={typeColors[selectedStrategy.type]}>
                        {typeLabels[selectedStrategy.type]}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                  <Tag color={selectedStrategy.enabled ? 'success' : 'default'}>
                    {selectedStrategy.enabled
                      ? '已启用 ✓ 扫描时会使用此策略'
                      : '已禁用 ✗ 扫描时会跳过此策略'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="上次运行">
                  {selectedStrategy.last_run || '从未运行'}
                </Descriptions.Item>
              </Descriptions>
                </Col>
              </Row>

              <Divider />

              <Alert
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                message={`💡 ${selectedStrategy.name} 是什么？`}
                description={
                  selectedStrategy.description || '这是一个选股策略，当满足特定条件时会通知你。'
                }
                style={{ marginBottom: 16 }}
              />

              {/* 扫描提示 */}
              <Alert
                type="warning"
                showIcon
                message="📌 快速扫描说明"
                description={
                  selectedStrategy.enabled
                    ? `当前策略已启用，点击「运行策略」可单独扫描此策略；快速扫描（结果页）会自动扫描所有已启用的策略。`
                    : `当前策略已禁用，快速扫描时会跳过此策略。如需纳入扫描，请先「启用」。`
                }
                style={{ marginBottom: 16 }}
              />

              {/* 内置策略特别提示 */}
              {selectedStrategy.type === 'builtin' && (
                <Alert
                  type="info"
                  showIcon
                  message="🔧 内置策略管理"
                  description={
                    '内置策略是系统预定义的策略，支持「启用/禁用」来控制扫描范围。'
                    + '如需添加新的内置策略，请点击「添加内置策略」按钮。'
                  }
                  style={{ marginBottom: 16 }}
                />
              )}

              {/* 风险提示 */}
              {selectedStrategy.tags?.includes('高风险') && (
                <Alert
                  type="warning"
                  showIcon
                  message="⚠️ 风险提示"
                  description="涨停追高风险大，建议新手不要贸然追高，先观察学习。"
                  style={{ marginBottom: 16 }}
                />
              )}

              {/* 运行结果展示 */}
              {runResults && (
                <>
                  <Divider />
                  <div style={{ marginBottom: 8 }}>
                    <Space>
                      <Text strong>扫描结果</Text>
                      <Tag color="blue">{runResults.length} 只匹配</Tag>
                      <Switch
                        checked={showHighScore}
                        onChange={setShowHighScore}
                        checkedChildren="高分"
                        unCheckedChildren="全部"
                        size="small"
                      />
                    </Space>
                  </div>
                  <Table
                    dataSource={showHighScore ? runResults.filter((r: any) => r.score >= 80) : runResults}
                    columns={[
                      {
                        title: '代码', dataIndex: 'stock_code', width: 90,
                        render: (code: string) => (
                          <a onClick={() => navigate(`/stock/${code}`)} style={{ fontFamily: 'monospace' }}>
                            {code}
                          </a>
                        ),
                      },
                      { title: '名称', dataIndex: 'stock_name', width: 90 },
                      {
                        title: '评分', dataIndex: 'score', width: 70,
                        render: (s: number) => {
                          const color = s >= 85 ? '#cf1322' : s >= 70 ? '#fa8c16' : '#1677ff'
                          return <Text strong style={{ color }}>{s}分</Text>
                        },
                      },
                      {
                        title: '原因', dataIndex: 'reason',
                        ellipsis: true,
                        render: (r: string) => (
                          <Tooltip title={r}>
                            <Text style={{ fontSize: 12 }}>{r?.substring(0, 30)}...</Text>
                          </Tooltip>
                        ),
                      },
                    ]}
                    rowKey={(_, idx) => String(idx)}
                    size="small"
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 500 }}
                    onRow={(record) => ({
                      onClick: () => navigate(`/stock/${record.stock_code}`),
                      style: { cursor: 'pointer' },
                    })}
                  />
                </>
              )}
            </Card>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                <FundOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <p>请从左侧选择一个策略查看详情</p>
                <Text type="secondary">
                  左侧开关可启用/禁用策略，快速扫描只会扫描已启用的策略
                </Text>
              </div>
            </Card>
          )}
        </Col>
      </Row>

      {/* 新建自定义策略弹窗 */}
      <Modal
        title="新建自定义策略"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="策略名称"
            rules={[{ required: true, message: '请输入策略名称' }]}
          >
            <Input placeholder="例：我的抄底策略" />
          </Form.Item>

          <Form.Item name="description" label="策略描述">
            <Input.TextArea rows={2} placeholder="简单描述一下这个策略..." />
          </Form.Item>

          <Divider>条件设置</Divider>

          <Form.Item name="condition_type" label="条件类型" initialValue="price">
            <Select>
              <Select.Option value="price">价格条件</Select.Option>
              <Select.Option value="ma">均线条件</Select.Option>
              <Select.Option value="volume">成交量条件</Select.Option>
              <Select.Option value="macd">MACD条件</Select.Option>
              <Select.Option value="rsi">RSI条件</Select.Option>
              <Select.Option value="kdj">KDJ条件</Select.Option>
              <Select.Option value="pct_chg">涨幅条件</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="operator" label="比较方式" initialValue=">">
            <Select>
              <Select.Option value=">">大于 (&gt;)</Select.Option>
              <Select.Option value=">=">大于等于 (&gt;=)</Select.Option>
              <Select.Option value="<">小于 (&lt;)</Select.Option>
              <Select.Option value="<=">小于等于 (&lt;=)</Select.Option>
              <Select.Option value="cross_above">上穿</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="period" label="周期（均线/指标周期）" initialValue="5">
            <Input type="number" placeholder="5" />
          </Form.Item>

          <Form.Item name="value" label="阈值" initialValue={0}>
            <Input type="number" step="0.01" placeholder="0" />
          </Form.Item>

          <Form.Item name="logic" label="逻辑组合" initialValue="AND">
            <Select>
              <Select.Option value="AND">所有条件都满足 (AND)</Select.Option>
              <Select.Option value="OR">任一条件满足 (OR)</Select.Option>
            </Select>
          </Form.Item>

          <Alert
            message="提示：当前为简化版编辑器，只支持单个条件。后续会升级为可视化条件组合器。"
            type="info"
            showIcon
          />
        </Form>
      </Modal>

      {/* 添加内置策略弹窗 */}
      <Modal
        title="添加内置策略"
        open={addBuiltinOpen}
        onCancel={() => setAddBuiltinOpen(false)}
        footer={null}
        width={500}
      >
        {loadingBuiltin ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
            <p style={{ marginTop: 12, color: '#999' }}>加载可用策略...</p>
          </div>
        ) : availableBuiltin.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <CheckCircleOutlined style={{ fontSize: 40, color: '#52c41a' }} />
            <p style={{ marginTop: 12, color: '#666' }}>
              所有内置策略已在列表中
            </p>
            <Text type="secondary">
              如需重新添加已移除的策略，请点击下方按钮
            </Text>
          </div>
        ) : (
          <List
            dataSource={availableBuiltin}
            renderItem={(item: any) => (
              <List.Item
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  marginBottom: 4,
                  border: '1px solid #f0f0f0',
                }}
                actions={[
                  <Button
                    type="link"
                    icon={<PlusOutlined />}
                    onClick={() => handleAddBuiltin(item.name)}
                  >
                    添加
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{item.name}</Text>
                      <Tag color="blue">内置策略</Tag>
                    </Space>
                  }
                  description={
                    <div>
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        style={{ marginBottom: 4, fontSize: 12, color: '#666' }}
                      >
                        {item.description}
                      </Paragraph>
                      {item.tags && item.tags.length > 0 && (
                        <Space size={4}>
                          {item.tags.map((tag: string) => (
                            <Tag key={tag} color={tagColors[tag] || 'default'} style={{ fontSize: 11 }}>
                              {tag}
                            </Tag>
                          ))}
                        </Space>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
        {/* 全部恢复按钮 */}
        {availableBuiltin.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button
              type="dashed"
              icon={<ReloadOutlined />}
              onClick={async () => {
                for (const item of availableBuiltin) {
                  await addBuiltinStrategy(item.name)
                }
                message.success(`已恢复 ${availableBuiltin.length} 个内置策略`)
                setAddBuiltinOpen(false)
                loadStrategies()
              }}
            >
              一键恢复所有内置策略
            </Button>
          </div>
        )}
      </Modal>

      {/* 批量管理弹窗 */}
      <Modal
        title={<Space><SettingOutlined />批量管理内置策略</Space>}
        open={batchModalOpen}
        onCancel={() => setBatchModalOpen(false)}
        onOk={handleBatchManage}
        okText="确认执行"
        confirmLoading={loadingAllBuiltin}
        width={650}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">选择要操作的内置策略和操作类型：</Text>
        </div>

        <Space style={{ marginBottom: 16 }}>
          <Select
            value={batchAction}
            onChange={(v) => setBatchAction(v)}
            options={[
              { value: 'add', label: '添加选中策略' },
              { value: 'delete', label: '移除选中策略' },
              { value: 'enable', label: '启用选中策略' },
              { value: 'disable', label: '禁用选中策略' },
            ]}
            style={{ width: 160 }}
          />
          <Button
            size="small"
            onClick={() => {
              const names = allBuiltinStrategies.map((s: any) => s.name)
              setSelectedBuiltinNames(names)
            }}
          >
            全选
          </Button>
          <Button
            size="small"
            onClick={() => setSelectedBuiltinNames([])}
          >
            清空
          </Button>
        </Space>

        {loadingAllBuiltin ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <List
            style={{ maxHeight: 400, overflow: 'auto' }}
            dataSource={allBuiltinStrategies}
            renderItem={(item: any) => {
              const statusColor: Record<string, string> = {
                enabled: 'success', disabled: 'default', not_added: 'warning',
              }
              const statusLabel: Record<string, string> = {
                enabled: '已启用', disabled: '已禁用', not_added: '未添加',
              }
              return (
                <List.Item
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: selectedBuiltinNames.includes(item.name) ? '#e6f4ff' : undefined,
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                  onClick={() => {
                    setSelectedBuiltinNames((prev) =>
                      prev.includes(item.name)
                        ? prev.filter((n) => n !== item.name)
                        : [...prev, item.name]
                    )
                  }}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{item.name}</Text>
                        <Tag color={statusColor[item.status]}>{statusLabel[item.status]}</Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>
                          {item.description}
                        </Paragraph>
                        {item.tags && item.tags.length > 0 && (
                          <Space size={4}>
                            {item.tags.map((tag: string) => (
                              <Tag key={tag} color={tagColors[tag] || 'default'} style={{ fontSize: 11 }}>
                                {tag}
                              </Tag>
                            ))}
                          </Space>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Modal>
    </div>
  )
}

export default Strategies
