import type { ChatId, ChatIndexEntry } from '../../../shared/types'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function ChatList(props: {
  chats: ChatIndexEntry[]
  selectedChatId: ChatId | null
  onSelect: (chatId: ChatId) => void
}) {
  const { chats, selectedChatId, onSelect } = props

  return (
    <div className="chatList">
      {chats.length === 0 ? (
        <div className="emptyState" style={{ padding: 18 }}>
          <div>
            <div style={{ marginBottom: 8 }}>No chats yet.</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Create a chat to start a multi-agent conversation.
            </div>
          </div>
        </div>
      ) : null}

      {chats.map((c) => (
        <Card
          key={c.id}
          variant="interactive"
          padding="sm"
          className={cn('chatItem', selectedChatId === c.id && 'chatItemActive')}
          onClick={() => onSelect(c.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSelect(c.id)
          }}
        >
          <p className="chatItemTitle">{c.title}</p>
          <div className="chatItemMeta">
            <span>{new Date(c.updatedAt).toLocaleDateString()}</span>
            <span>{new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}
