import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { Chat, ChatId, ChatIndexEntry, Message } from '../shared/types'
import { ChatList } from './features/chats/ChatList'
import { ChatView } from './features/chats/ChatView'
import { NewChatDialog } from './features/chats/NewChatDialog'
import { EditChatDialog } from './features/chats/EditChatDialog'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('theme')
  return saved === 'light' ? 'light' : 'dark'
}

function App() {
  const [chats, setChats] = useState<ChatIndexEntry[]>([])
  const [selectedChatId, setSelectedChatId] = useState<ChatId | null>(null)
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [editChatOpen, setEditChatOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  const selectedIndexEntry = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  async function refreshChats() {
    const list = await window.api.chats.list()
    setChats(list)
  }

  async function loadChat(chatId: ChatId) {
    setLoadingChat(true)
    setError(null)
    try {
      const [loadedChat, loadedMessages] = await Promise.all([
        window.api.chats.get(chatId),
        window.api.messages.list({ chatId, limit: 200 }),
      ])
      setChat(loadedChat)
      setMessages(loadedMessages)
      setSelectedChatId(chatId)
      setMobileSidebarOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingChat(false)
    }
  }

  async function onCreatedChat(created: Chat) {
    setNewChatOpen(false)
    await refreshChats()
    await loadChat(created.id)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    refreshChats().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const ThemeIcon = theme === 'dark' ? Sun : Moon

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <div className="brand">
            <div className="brandTitle">Agents Chat</div>
            <div className="brandSub">Local, multi-agent group chats</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              <ThemeIcon className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="sm" onClick={() => setNewChatOpen(true)}>
              New chat
            </Button>
          </div>
        </div>

        <ChatList
          chats={chats}
          selectedChatId={selectedChatId}
          onSelect={(id) => loadChat(id)}
        />
      </aside>

      <main className="main">
        <div className="mobileBar">
          <Button variant="outline" size="sm" onClick={() => setMobileSidebarOpen(true)}>
            Chats
          </Button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              <ThemeIcon className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="sm" onClick={() => setNewChatOpen(true)}>
              New chat
            </Button>
          </div>
        </div>

        {error ? (
          <div className="emptyState">
            <div>
              <div style={{ marginBottom: 8 }}>Something went wrong.</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{error}</div>
            </div>
          </div>
        ) : (
          <ChatView
            indexEntry={selectedIndexEntry}
            chat={chat}
            messages={messages}
            loading={loadingChat}
            onRefresh={() => refreshChats()}
            onMessagesChanged={(next) => setMessages(next)}
            onOpenNewChat={() => setNewChatOpen(true)}
            onEditChat={() => setEditChatOpen(true)}
          />
        )}
      </main>

      {mobileSidebarOpen ? (
        <div className="dialogBackdrop" role="dialog" aria-modal="true">
          <div className="dialog mobileSidebar">
            <div className="dialogHeader">
              <h2 className="dialogTitle">Chats</h2>
              <Button variant="outline" size="sm" onClick={() => setMobileSidebarOpen(false)}>
                Close
              </Button>
            </div>
            <div style={{ paddingTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <Button variant="primary" size="sm" onClick={() => setNewChatOpen(true)}>
                New chat
              </Button>
              <Button variant="outline" size="sm" onClick={() => refreshChats()}>
                Refresh
              </Button>
            </div>
            <div style={{ marginTop: 12 }}>
              <ChatList chats={chats} selectedChatId={selectedChatId} onSelect={(id) => loadChat(id)} />
            </div>
          </div>
        </div>
      ) : null}

      {newChatOpen ? (
        <NewChatDialog
          onClose={() => setNewChatOpen(false)}
          onCreated={onCreatedChat}
        />
      ) : null}

      {editChatOpen && chat ? (
        <EditChatDialog
          chat={chat}
          onClose={() => setEditChatOpen(false)}
          onUpdated={(updated) => {
            setEditChatOpen(false)
            setChat(updated)
            window.api.messages
              .list({ chatId: updated.id, limit: 200 })
              .then((next) => setMessages(next))
              .catch(() => undefined)
            refreshChats().catch(() => undefined)
          }}
        />
      ) : null}
    </div>
  )
}

export default App
