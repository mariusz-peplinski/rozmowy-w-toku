import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { OpenDialogOptions } from 'electron'
import type { AgentRunOptions, CreateChatInput, ListMessagesInput, RunBatchResult, UpdateChatInput } from '../../../shared/types'
import { IpcChannels } from '../../../shared/ipc'
import { ChatStore } from '../store/chatStore'
import type { Message } from '../../../shared/types'
import { newId, nowIso } from '../util/ids'
import { AgentService } from '../agents/agentService'
import { MentionEngine } from '../mentions/mentionEngine'
import { DebugLogStore } from '../debug/debugLogStore'

export function registerIpcHandlers(opts: {
  chatStore: ChatStore
  userDataPath: string
  getFocusedWindow: () => BrowserWindow | null
}): void {
  const { chatStore, getFocusedWindow, userDataPath } = opts
  const debugLogStore = new DebugLogStore()
  const broadcast = (channel: string, payload: unknown) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(channel, payload)
    }
  }
  const emitMessageAppended = (chatId: string, message: Message) => {
    broadcast(IpcChannels.MessagesAppended, { chatId, message })
  }
  const emitMentionState = (chatId: string, mentionPaused: boolean, pendingMentionParticipantIds: string[] = []) => {
    broadcast(IpcChannels.MentionState, { chatId, mentionPaused, pendingMentionParticipantIds })
  }

  const agentService = new AgentService({
    userDataPath,
    chatStore,
    debugLogStore,
    onRunStatus: (evt) => broadcast(IpcChannels.AgentRunStatus, evt),
  })
  const mentionEngine = new MentionEngine({
    chatStore,
    agentService,
    onMessageAppended: (chatId, message) => emitMessageAppended(chatId, message),
    onMentionState: (chatId, paused, pendingParticipantIds) => emitMentionState(chatId, paused, pendingParticipantIds),
  })

  ipcMain.handle(IpcChannels.ChatsList, async () => {
    return chatStore.listChats()
  })

  ipcMain.handle(IpcChannels.ChatsCreate, async (_evt, input: CreateChatInput) => {
    return chatStore.createChat(input)
  })

  ipcMain.handle(IpcChannels.ChatsGet, async (_evt, chatId: string) => {
    return chatStore.getChat(chatId)
  })

  ipcMain.handle(IpcChannels.ChatsUpdate, async (_evt, input: UpdateChatInput) => {
    return chatStore.updateChat(input)
  })

  ipcMain.handle(IpcChannels.MessagesList, async (_evt, input: ListMessagesInput) => {
    return chatStore.listMessages(input.chatId, input.limit)
  })

  ipcMain.handle(IpcChannels.MessagesAppendUser, async (_evt, chatId: string, text: string) => {
    const msg: Message = {
      id: newId('m'),
      ts: nowIso(),
      authorKind: 'user',
      authorId: 'user',
      authorDisplayName: 'You',
      text,
      meta: { trigger: 'manual' },
    }
    await chatStore.appendMessage(chatId, msg)
    emitMessageAppended(chatId, msg)
    emitMentionState(chatId, false, [])
    mentionEngine.runFromTriggerMessage(chatId, msg, 3).catch((err) => {
      console.error('Mention engine failed after user message', err)
      emitMentionState(chatId, false, [])
    })

    const result: RunBatchResult = {
      messages: [msg],
      mentionPaused: false,
      pendingMentionParticipantIds: [],
    }
    return result
  })

  ipcMain.handle(IpcChannels.MessagesDelete, async (_evt, chatId: string, messageId: string) => {
    await chatStore.deleteMessage(chatId, messageId)
  })

  ipcMain.handle(IpcChannels.AgentsRun, async (_evt, chatId: string, participantId: string, options: AgentRunOptions) => {
    const msg = await agentService.runAgent(chatId, participantId, options ?? {})
    emitMessageAppended(chatId, msg)
    emitMentionState(chatId, false, [])
    mentionEngine.runFromTriggerMessage(chatId, msg, 3).catch((err) => {
      console.error('Mention engine failed after manual agent run', err)
      emitMentionState(chatId, false, [])
    })

    const result: RunBatchResult = {
      messages: [msg],
      mentionPaused: false,
      pendingMentionParticipantIds: [],
    }
    return result
  })

  ipcMain.handle(IpcChannels.MentionsResume, async (_evt, chatId: string) => {
    emitMentionState(chatId, false, [])
    mentionEngine.resume(chatId, 3).catch((err) => {
      console.error('Mention engine failed while resuming', err)
      emitMentionState(chatId, false, [])
    })
    const result: RunBatchResult = {
      messages: [],
      mentionPaused: false,
      pendingMentionParticipantIds: [],
    }
    return result
  })

  ipcMain.handle(IpcChannels.DebugRunsList, async (_evt, chatId: string) => {
    return debugLogStore.listRuns(chatId)
  })

  ipcMain.handle(IpcChannels.DebugRunsClear, async (_evt, chatId: string) => {
    debugLogStore.clearRuns(chatId)
  })

  ipcMain.handle(IpcChannels.DialogPickDirectory, async () => {
    const win = getFocusedWindow()
    const options: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Choose a workspace directory',
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (res.canceled) return null
    return res.filePaths[0] ?? null
  })
}
