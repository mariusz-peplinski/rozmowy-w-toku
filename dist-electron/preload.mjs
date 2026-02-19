"use strict";
const electron = require("electron");
const IpcChannels = {
  ChatsList: "chats:list",
  ChatsCreate: "chats:create",
  ChatsGet: "chats:get",
  ChatsUpdate: "chats:update",
  MessagesList: "messages:list",
  MessagesAppendUser: "messages:appendUser",
  MessagesDelete: "messages:delete",
  AgentsRun: "agents:run",
  AgentRunStatus: "agents:runStatus",
  MentionsResume: "mentions:resume",
  DialogPickDirectory: "dialog:pickDirectory",
  DebugRunsList: "debug:runs:list",
  DebugRunsClear: "debug:runs:clear"
};
const api = {
  chats: {
    list: () => electron.ipcRenderer.invoke(IpcChannels.ChatsList),
    create: (input) => electron.ipcRenderer.invoke(IpcChannels.ChatsCreate, input),
    get: (chatId) => electron.ipcRenderer.invoke(IpcChannels.ChatsGet, chatId),
    update: (input) => electron.ipcRenderer.invoke(IpcChannels.ChatsUpdate, input)
  },
  messages: {
    list: (input) => electron.ipcRenderer.invoke(IpcChannels.MessagesList, input),
    appendUser: (chatId, text) => electron.ipcRenderer.invoke(IpcChannels.MessagesAppendUser, chatId, text),
    delete: (chatId, messageId) => electron.ipcRenderer.invoke(IpcChannels.MessagesDelete, chatId, messageId)
  },
  agents: {
    run: (chatId, participantId, opts) => electron.ipcRenderer.invoke(IpcChannels.AgentsRun, chatId, participantId, opts ?? {})
  },
  mentions: {
    resume: (chatId) => electron.ipcRenderer.invoke(IpcChannels.MentionsResume, chatId)
  },
  dialog: {
    pickDirectory: () => electron.ipcRenderer.invoke(IpcChannels.DialogPickDirectory)
  },
  debug: {
    listRuns: (chatId) => electron.ipcRenderer.invoke(IpcChannels.DebugRunsList, chatId),
    clearRuns: (chatId) => electron.ipcRenderer.invoke(IpcChannels.DebugRunsClear, chatId)
  },
  events: {
    onAgentRunStatus: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      electron.ipcRenderer.on(IpcChannels.AgentRunStatus, listener);
      return () => electron.ipcRenderer.off(IpcChannels.AgentRunStatus, listener);
    }
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
