import { useEffect, useMemo, useState } from 'react'
import type { Chat, ChatId, ChatIndexEntry, Message } from '../shared/types'
import { ChatList } from './features/chats/ChatList'
import { ChatView } from './features/chats/ChatView'
import { NewChatDialog } from './features/chats/NewChatDialog'
import { EditChatDialog } from './features/chats/EditChatDialog'
import { Button } from '@/components/ui/button'
import { Menu, Moon, Sun } from 'lucide-react'

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
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    refreshChats().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const ThemeIcon = theme === 'dark' ? Sun : Moon
  const drawerId = 'app-drawer'

  return (
    <div className="drawer lg:drawer-open">
      <input
        id={drawerId}
        type="checkbox"
        className="drawer-toggle"
        checked={mobileSidebarOpen}
        onChange={(e) => setMobileSidebarOpen(e.target.checked)}
      />

      <div className="drawer-content flex h-screen min-h-0 flex-col overflow-hidden">
        <div className="navbar sticky top-0 z-10 border-b border-base-300 bg-base-100">
          <div className="flex-none lg:hidden">
            <label htmlFor={drawerId} className="btn btn-ghost btn-square" aria-label="Open chats">
              <Menu className="h-5 w-5" />
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <div className="min-w-0">
              <div className="font-bold truncate">
                {selectedIndexEntry?.title ? selectedIndexEntry.title : 'Rozmowy w Toku'}
              </div>
              <div className="text-xs opacity-70 truncate">
                Local, multi-agent group chats
              </div>
            </div>
          </div>
          <div className="flex-none gap-2">
            <Button
              variant="ghost"
              size="icon"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              <ThemeIcon className="h-5 w-5" />
            </Button>
            <Button variant="primary" size="sm" onClick={() => setNewChatOpen(true)}>
              New chat
            </Button>
          </div>
        </div>

        <main className="flex-1 min-h-0 overflow-hidden">
          {error ? (
            <div className="p-4">
              <div className="alert alert-error">
                <div>
                  <div className="font-semibold">Something went wrong</div>
                  <div className="font-mono text-xs whitespace-pre-wrap">{error}</div>
                </div>
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
      </div>

      <div className="drawer-side z-20">
        <label htmlFor={drawerId} aria-label="Close chats" className="drawer-overlay" />
        <aside className="min-h-full w-80 border-r border-base-300 bg-base-100 flex flex-col">
          <div className="p-4 border-b border-base-300">
            <div className="font-bold">Chats</div>
            <div className="text-xs opacity-70">Pick one to continue</div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refreshChats()}>
                Refresh
              </Button>
              <Button variant="primary" size="sm" onClick={() => setNewChatOpen(true)}>
                New
              </Button>
            </div>
          </div>
          <div className="p-2 flex-1 min-h-0 overflow-y-auto">
            <ChatList chats={chats} selectedChatId={selectedChatId} onSelect={(id) => loadChat(id)} />
          </div>
        </aside>
      </div>

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
