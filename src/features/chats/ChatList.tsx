import type { ChatId, ChatIndexEntry } from '../../../shared/types'
import { cn } from '@/lib/utils'

export function ChatList(props: {
  chats: ChatIndexEntry[]
  selectedChatId: ChatId | null
  onSelect: (chatId: ChatId) => void
}) {
  const { chats, selectedChatId, onSelect } = props

  return (
    <div>
      {chats.length === 0 ? (
        <div className="p-3">
          <div className="alert">
            <div>
              <div className="font-semibold">No chats yet</div>
              <div className="text-sm opacity-70">Create a chat to start a multi-agent conversation.</div>
            </div>
          </div>
        </div>
      ) : null}

      {chats.length > 0 ? (
        <ul className="menu menu-sm w-full rounded-box bg-base-200">
          {chats.map((c) => {
            const active = selectedChatId === c.id
            return (
              <li key={c.id}>
                <button
                  className={cn('w-full items-start py-3', active && 'active')}
                  onClick={() => onSelect(c.id)}
                  title={c.title}
                >
                  <div className="flex w-full min-w-0 flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{c.title}</span>
                      <span className="text-[11px] opacity-60 shrink-0">
                        {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] opacity-60">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
