import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Input, Button, Spin, Typography, Space, Tag, AutoComplete,
} from 'antd'
import {
  RobotOutlined, SendOutlined, DeleteOutlined, SearchOutlined,
  StockOutlined, ClearOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

import {
  getLLMStatus, chatWithAI,
  type ChatMessage, type LLMStatus,
} from '../api/llm'
import { searchStocks } from '../api/index'

const { Text } = Typography

interface UIMessage extends ChatMessage {
  id: string
  time: string
  loading?: boolean
  tokens?: number
}

const WELCOME_MSG: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是你的 A 股量化分析助手。\n\n我可以帮你：\n• 分析个股技术面（均线/MACD/RSI/KDJ/布林带）\n• 解读策略信号和买卖时机\n• 评估风险和大盘环境\n• 解答金融概念和操作疑问\n\n输入股票代码或直接提问，随时开始 👇',
  time: '',
}

// ========================================
const AIAnalysis: React.FC = () => {
  const [messages, setMessages] = useState<UIMessage[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [llmStatus, setLLMStatus] = useState<LLMStatus | null>(null)

  // 搜索
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  // 当前关注的股票（自动注入数据上下文）
  const [activeStock, setActiveStock] = useState<{ code: string; name: string } | null>(null)

  const msgListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)
  const idCounter = useRef(0)

  useEffect(() => {
    getLLMStatus().then(s => setLLMStatus(s)).catch(() => { })
  }, [])

  // 自动滚到底部
  useEffect(() => {
    if (msgListRef.current) {
      msgListRef.current.scrollTop = msgListRef.current.scrollHeight
    }
  }, [messages])

  const addMsg = (role: 'user' | 'assistant', content: string, extra?: Partial<UIMessage>) => {
    idCounter.current += 1
    const msg: UIMessage = {
      id: String(idCounter.current),
      role,
      content,
      time: dayjs().format('HH:mm'),
      ...extra,
    }
    setMessages(prev => [...prev, msg])
    return msg
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    // 检查是否是股票代码
    const codeMatch = text.match(/^(\d{6})$/)
    if (codeMatch) {
      handleSearch(codeMatch[1])
      return
    }

    addMsg('user', text)

    // 构建发送的消息列表（最近20轮）
    const chatMsgs: ChatMessage[] = []
    for (const m of messages) {
      if (m.id === 'welcome') continue
      if (m.role === 'user' || m.role === 'assistant') {
        chatMsgs.push({ role: m.role, content: m.content })
      }
    }
    chatMsgs.push({ role: 'user', content: text })

    const loadingMsg = addMsg('assistant', '思考中...', { loading: true })
    setLoading(true)

    try {
      const res = await chatWithAI(chatMsgs, activeStock?.code)
      // 替换加载消息
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: res.reply, loading: false, tokens: res.tokens }
          : m
      ))
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: `抱歉，请求失败：${e?.message || '网络错误'}`, loading: false }
          : m
      ))
    } finally {
      setLoading(false)
    }
  }

  // 处理股票搜索
  const handleSearch = async (keyword: string) => {
    setSearchKeyword(keyword)
    if (keyword.length < 2) { setSearchResults([]); return }
    try {
      const res = await searchStocks(keyword)
      setSearchResults((res as any[])?.slice(0, 8) || [])
    } catch {
      setSearchResults([])
    }
  }

  // 选中股票
  const selectStock = (stock: any) => {
    setActiveStock({ code: stock.code, name: stock.name })
    setInput(`${stock.name}(${stock.code})怎么样？`)
    setSearchResults([])
    setSearchKeyword('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const clearChat = () => {
    setMessages([WELCOME_MSG])
    setActiveStock(null)
    idCounter.current = 0
  }

  const stockBtnColor = activeStock ? '#1677ff' : '#d9d9d9'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 700, margin: '0 auto' }}>
      {/* 顶部栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
      }}>
        <Space>
          <RobotOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          <Text strong>AI 金融助手</Text>
          {llmStatus && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {llmStatus.available ? '🟢 在线' : '🔴 离线'}
            </Text>
          )}
        </Space>
        <Space>
          {activeStock && (
            <Tag color="blue" closable onClose={() => setActiveStock(null)}>
              <StockOutlined /> {activeStock.name}({activeStock.code})
            </Tag>
          )}
          <Button size="small" icon={<ClearOutlined />} onClick={clearChat} type="text" title="清空对话" />
        </Space>
      </div>

      {/* 消息列表 */}
      <div
        ref={msgListRef}
        style={{
          flex: 1, overflow: 'auto', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {/* 气泡 */}
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: 12,
              background: msg.role === 'user'
                ? '#1677ff'
                : msg.loading ? '#f5f5f5' : '#f0f5ff',
              color: msg.role === 'user' ? '#fff' : '#333',
              fontSize: 14,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.loading ? (
                <Space>
                  <Spin size="small" />
                  <Text style={{ color: '#999', fontSize: 13 }}>思考中...</Text>
                </Space>
              ) : (
                msg.content
              )}
            </div>
            {/* 元信息 */}
            {msg.time && (
              <Text type="secondary" style={{ fontSize: 10, marginTop: 2, marginLeft: 4, marginRight: 4 }}>
                {msg.time}{msg.tokens ? ` · ${msg.tokens}t` : ''}
              </Text>
            )}
          </div>
        ))}
      </div>

      {/* 搜索下拉 */}
      {searchResults.length > 0 && (
        <div style={{
          margin: '0 16px', padding: '8px 12px',
          background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', flexShrink: 0,
        }}>
          {searchResults.map(s => (
            <div
              key={s.code}
              onClick={() => selectStock(s)}
              style={{
                padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f5ff')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <Text strong>{s.name}</Text>
              <Text type="secondary">{s.code}</Text>
            </div>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div style={{
        padding: '8px 16px 12px', borderTop: '1px solid #f0f0f0', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AutoComplete
            value={searchKeyword}
            onChange={(v) => handleSearch(v)}
            style={{ width: 140 }}
            options={searchResults.map(s => ({
              value: s.code,
              label: <span>{s.name} <Text type="secondary">{s.code}</Text></span>,
            }))}
            onSelect={(v) => {
              const s = searchResults.find(x => x.code === v)
              if (s) selectStock(s)
            }}
          >
            <Input
              prefix={<SearchOutlined style={{ color: '#999' }} />}
              placeholder="搜索股票"
              size="small"
              allowClear
            />
          </AutoComplete>
          <Input.TextArea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="输入股票代码或直接提问..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={loading}
            style={{ flex: 1, borderRadius: 8 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={loading}
            style={{ borderRadius: 8 }}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
          输入 6 位代码查股票 · Enter 发送 · Shift+Enter 换行
        </Text>
      </div>
    </div>
  )
}

export default AIAnalysis
