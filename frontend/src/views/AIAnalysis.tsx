import React, { useEffect, useState, useRef } from 'react'
import {
  Input, Button, Spin, Typography, Space, Tag,
} from 'antd'
import {
  RobotOutlined, SendOutlined,
  StockOutlined, ClearOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

import {
  getLLMStatus, chatWithAI,
  type ChatMessage, type LLMStatus,
} from '../api/llm'

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
  content: '你好！我是你的 A 股量化分析助手。\n\n我可以帮你：\n\u2022 分析个股技术面（均线/MACD/RSI/KDJ/布林带）\n\u2022 解读策略信号和买卖时机\n\u2022 评估风险和大盘环境\n\u2022 解答金融概念和操作疑问\n\n输入股票代码或直接提问，随时开始 \uD83D\uDC47',
  time: '',
}

// ========================================
const AIAnalysis: React.FC = () => {
  const [messages, setMessages] = useState<UIMessage[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [llmStatus, setLLMStatus] = useState<LLMStatus | null>(null)

  // 当前关注的股票（输入6位代码自动设置）
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

    // 单独输入 6 位代码 → 设置活跃股票并自动提问
    const codeMatch = text.match(/^(\d{6})$/)
    if (codeMatch) {
      setActiveStock({ code: codeMatch[1], name: codeMatch[1] })
      setInput(`${codeMatch[1]}怎么样？`)
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

  const clearChat = () => {
    setMessages([WELCOME_MSG])
    setActiveStock(null)
    idCounter.current = 0
  }

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
              {llmStatus.available ? '\uD83D\uDFE2 在线' : '\uD83D\uDD34 离线'}
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
            {msg.time && (
              <Text type="secondary" style={{ fontSize: 10, marginTop: 2, marginLeft: 4, marginRight: 4 }}>
                {msg.time}{msg.tokens ? ` \u00B7 ${msg.tokens}t` : ''}
              </Text>
            )}
          </div>
        ))}
      </div>

      {/* 输入框 — 底部 */}
      <div style={{
        padding: '8px 16px 12px', borderTop: '1px solid #f0f0f0', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
            placeholder="输入 6 位股票代码或直接提问..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={loading}
            style={{ flex: 1, borderRadius: 8 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={loading}
            style={{ borderRadius: 8, marginBottom: 2 }}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
          Enter 发送 \u00B7 Shift+Enter 换行 \u00B7 输入 6 位代码查股
        </Text>
      </div>
    </div>
  )
}

export default AIAnalysis
