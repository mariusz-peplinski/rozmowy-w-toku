var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { ipcMain, dialog, BrowserWindow, app } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
function getDataPaths(userDataPath) {
  const dataRoot = path.join(userDataPath, "data");
  const v1Root = path.join(dataRoot, "v1");
  const chatsRoot = path.join(v1Root, "chats");
  return {
    dataRoot,
    v1Root,
    chatsRoot,
    chatsIndexFile: path.join(chatsRoot, "index.json"),
    settingsFile: path.join(v1Root, "settings.json")
  };
}
function chatDir(chatsRoot, chatId) {
  return path.join(chatsRoot, chatId);
}
function chatMetaFile(chatsRoot, chatId) {
  return path.join(chatDir(chatsRoot, chatId), "chat.json");
}
function chatMessagesFile(chatsRoot, chatId) {
  return path.join(chatDir(chatsRoot, chatId), "messages.jsonl");
}
function chatWorkspaceDir(chatsRoot, chatId) {
  return path.join(chatDir(chatsRoot, chatId), "workspace");
}
async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}
async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}
async function writeJsonFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  const raw = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(tmp, raw, "utf8");
  await fs.rename(tmp, filePath);
}
async function appendJsonlLine(filePath, line) {
  const raw = JSON.stringify(line) + "\n";
  await fs.appendFile(filePath, raw, "utf8");
}
async function readJsonlFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const items = [];
  for (const line of lines) {
    items.push(JSON.parse(line));
  }
  return items;
}
function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function slugifyHandle(displayName) {
  const base = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return base || "agent";
}
function uniqueHandles(participants) {
  const used = /* @__PURE__ */ new Map();
  const handles = [];
  for (const p of participants) {
    const base = slugifyHandle(p.displayName);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    handles.push(count === 0 ? base : `${base}-${count + 1}`);
  }
  return handles;
}
function isDeleteEvent(x) {
  if (typeof x !== "object" || x === null) return false;
  return "kind" in x && x.kind === "delete";
}
function isBoundaryChar$1(ch) {
  return /\s|[([{'"`]|[.,;:!?]/.test(ch);
}
function rewriteMentionsInText(text, rewrites) {
  const tokenRewrites = [];
  for (const r of rewrites) {
    if (r.oldHandle && r.oldHandle !== r.newHandle) {
      tokenRewrites.push({
        token: `@${r.oldHandle}`,
        tokenLower: `@${r.oldHandle}`.toLowerCase(),
        replaceWith: `@${r.newHandle}`
      });
    }
    if (r.oldDisplayName.trim() && r.oldDisplayName !== r.newDisplayName) {
      tokenRewrites.push({
        token: `@${r.oldDisplayName.trim()}`,
        tokenLower: `@${r.oldDisplayName.trim()}`.toLowerCase(),
        replaceWith: `@${r.newDisplayName.trim()}`
      });
    }
  }
  if (tokenRewrites.length === 0) return text;
  tokenRewrites.sort((a, b) => b.token.length - a.token.length);
  const lower = text.toLowerCase();
  let out = "";
  let cursor = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue;
    if (i > 0 && !isBoundaryChar$1(text[i - 1])) continue;
    let matched = null;
    for (const c of tokenRewrites) {
      if (!lower.startsWith(c.tokenLower, i)) continue;
      const end = i + c.token.length;
      if (end < text.length && !isBoundaryChar$1(text[end])) continue;
      matched = c;
      break;
    }
    if (!matched) continue;
    out += text.slice(cursor, i);
    out += matched.replaceWith;
    i += matched.token.length - 1;
    cursor = i + 1;
  }
  if (cursor === 0) return text;
  out += text.slice(cursor);
  return out;
}
class ChatStore {
  constructor(userDataPath) {
    __publicField(this, "chatsRoot");
    __publicField(this, "chatsIndexFile");
    const paths = getDataPaths(userDataPath);
    this.chatsRoot = paths.chatsRoot;
    this.chatsIndexFile = paths.chatsIndexFile;
  }
  async init() {
    await ensureDir(this.chatsRoot);
    if (!await pathExists(this.chatsIndexFile)) {
      const empty = { version: 1, chats: [] };
      await writeJsonFileAtomic(this.chatsIndexFile, empty);
    }
  }
  async listChats() {
    const idx = await this.readIndex();
    return [...idx.chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getChat(chatId) {
    return readJsonFile(chatMetaFile(this.chatsRoot, chatId));
  }
  async createChat(input) {
    var _a;
    const chatId = newId("c");
    const createdAt = nowIso();
    const title = (((_a = input.title) == null ? void 0 : _a.trim()) || `New chat ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`).trim();
    const handles = uniqueHandles(input.participants);
    const participants = input.participants.map((p, i) => ({
      id: newId("a"),
      type: p.type,
      displayName: p.displayName.trim() || `Agent ${i + 1}`,
      handle: handles[i],
      colorHex: p.colorHex,
      persona: p.persona,
      roaming: p.roaming
    }));
    const chat = {
      id: chatId,
      title,
      createdAt,
      updatedAt: createdAt,
      context: input.context,
      participants
    };
    const dir = chatDir(this.chatsRoot, chatId);
    await ensureDir(dir);
    await writeJsonFileAtomic(chatMetaFile(this.chatsRoot, chatId), chat);
    await fs.writeFile(chatMessagesFile(this.chatsRoot, chatId), "", "utf8");
    await this.upsertIndexEntry({
      id: chatId,
      title,
      createdAt,
      updatedAt: createdAt
    });
    return chat;
  }
  async updateChat(input) {
    const existing = await this.getChat(input.chatId);
    const updatedAt = nowIso();
    const normalizedParticipants = input.participants.map((p, i) => ({
      ...p,
      displayName: p.displayName.trim() || `Agent ${i + 1}`
    }));
    const handles = uniqueHandles(normalizedParticipants);
    const participants = normalizedParticipants.map((p, i) => ({
      ...p,
      handle: handles[i]
    }));
    const oldById = new Map(existing.participants.map((p) => [p.id, p]));
    const rewrites = [];
    for (const p of participants) {
      const old = oldById.get(p.id);
      if (!old) continue;
      if (old.handle === p.handle && old.displayName === p.displayName) continue;
      rewrites.push({
        oldHandle: old.handle,
        oldDisplayName: old.displayName,
        newHandle: p.handle,
        newDisplayName: p.displayName
      });
    }
    const next = {
      ...existing,
      title: input.title.trim() || existing.title,
      context: input.context,
      participants,
      updatedAt
    };
    if (rewrites.length > 0) {
      await this.rewriteMentionsInMessages(existing.id, rewrites);
    }
    await writeJsonFileAtomic(chatMetaFile(this.chatsRoot, existing.id), next);
    await this.upsertIndexEntry({
      id: next.id,
      title: next.title,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt
    });
    return next;
  }
  async appendMessage(chatId, message) {
    await appendJsonlLine(chatMessagesFile(this.chatsRoot, chatId), message);
    await this.touchChatIndex(chatId, message.ts);
  }
  async deleteMessage(chatId, messageId) {
    const evt = {
      kind: "delete",
      id: newId("del"),
      ts: nowIso(),
      targetMessageId: messageId
    };
    await appendJsonlLine(chatMessagesFile(this.chatsRoot, chatId), evt);
    await this.touchChatIndex(chatId, evt.ts);
  }
  async listMessages(chatId, limit = 200) {
    const file = chatMessagesFile(this.chatsRoot, chatId);
    if (!await pathExists(file)) return [];
    const all = await readJsonlFile(file);
    const deleted = /* @__PURE__ */ new Set();
    const messages = [];
    for (const item of all) {
      if (isDeleteEvent(item)) {
        deleted.add(item.targetMessageId);
      } else {
        messages.push(item);
      }
    }
    const filtered = messages.filter((m) => !deleted.has(m.id));
    if (filtered.length <= limit) return filtered;
    return filtered.slice(filtered.length - limit);
  }
  async readIndex() {
    return readJsonFile(this.chatsIndexFile);
  }
  async writeIndex(idx) {
    await writeJsonFileAtomic(this.chatsIndexFile, idx);
  }
  async upsertIndexEntry(entry) {
    const idx = await this.readIndex();
    const existing = idx.chats.findIndex((c) => c.id === entry.id);
    if (existing >= 0) idx.chats[existing] = entry;
    else idx.chats.push(entry);
    await this.writeIndex(idx);
  }
  async touchChatIndex(chatId, updatedAt) {
    const idx = await this.readIndex();
    const existing = idx.chats.find((c) => c.id === chatId);
    if (!existing) return;
    existing.updatedAt = updatedAt;
    await this.writeIndex(idx);
  }
  async rewriteMentionsInMessages(chatId, rewrites) {
    const file = chatMessagesFile(this.chatsRoot, chatId);
    if (!await pathExists(file)) return;
    const all = await readJsonlFile(file);
    let changed = false;
    const rewritten = all.map((item) => {
      if (isDeleteEvent(item)) return item;
      const nextText = rewriteMentionsInText(item.text, rewrites);
      if (nextText === item.text) return item;
      changed = true;
      return { ...item, text: nextText };
    });
    if (!changed) return;
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}`);
    const raw = rewritten.map((line) => JSON.stringify(line)).join("\n") + "\n";
    await fs.writeFile(tmp, raw, "utf8");
    await fs.rename(tmp, file);
  }
}
const IpcChannels = {
  ChatsList: "chats:list",
  ChatsCreate: "chats:create",
  ChatsGet: "chats:get",
  ChatsUpdate: "chats:update",
  MessagesList: "messages:list",
  MessagesAppendUser: "messages:appendUser",
  MessagesAppended: "messages:appended",
  MessagesDelete: "messages:delete",
  AgentsRun: "agents:run",
  AgentRunStatus: "agents:runStatus",
  MentionsResume: "mentions:resume",
  MentionState: "mentions:state",
  DialogPickDirectory: "dialog:pickDirectory",
  DebugRunsList: "debug:runs:list",
  DebugRunsClear: "debug:runs:clear"
};
function formatRoster(chat) {
  return chat.participants.map((p) => `- ${p.displayName} (@${p.handle}): ${oneLine(p.persona)}`).join("\n");
}
function oneLine(text) {
  return text.trim().replace(/\s+/g, " ");
}
function formatTranscript(chat, messages, limitChars) {
  const idToHandle = new Map(chat.participants.map((p) => [p.id, p.handle]));
  const lines = messages.map((m) => {
    if (m.authorKind === "agent") {
      const handle = idToHandle.get(m.authorId) ? ` (@${idToHandle.get(m.authorId)})` : "";
      return `**${m.authorDisplayName}${handle}**: ${m.text}`;
    }
    return `**${m.authorDisplayName}**: ${m.text}`;
  });
  let out = lines.join("\n");
  if (out.length <= limitChars) return out;
  out = out.slice(out.length - limitChars);
  return `…(truncated)
${out}`;
}
function buildAgentPrompt(opts) {
  const { chat, participant, messages } = opts;
  const prompt = [
    "# Role",
    participant.persona.trim(),
    "",
    "# Chat Context",
    chat.context.trim() || "(No context provided.)",
    "",
    "# Participants",
    formatRoster(chat) || "(No other participants.)",
    "",
    "# Instructions",
    `- You are ${participant.displayName} (@${participant.handle}). Respond in character.`,
    "- Write a single chat message that moves the discussion forward.",
    "- Be concise unless more detail is necessary to be correct.",
    "- Do not @mention others unless you actually need their input or you are directly responding to them.",
    "- If you do @mention someone, mention them at most once per message (or use @everyone to address all agents).",
    '- Output only the message body (no prefix like "Name:").',
    participant.roaming.enabled ? "- You may read files and run commands in the configured workspace directory if needed for accuracy." : "- Do not claim you ran commands or read files; you do not have workspace access in this mode.",
    "",
    "# Transcript",
    formatTranscript(chat, messages, 25e3),
    "",
    "# Your turn"
  ].join("\n");
  return prompt;
}
async function runProcess(opts) {
  const { command, args, cwd, env, timeoutMs, stdin } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env ?? {} },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, signal, timedOut });
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}
function normalizeOutput(text) {
  return text.replace(/\r\n/g, "\n").trim();
}
function isEnoent(err) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
async function runProviderDetailed(input) {
  var _a;
  const timeoutMs = input.timeoutMs ?? (input.roaming.enabled ? 24e4 : 9e4);
  const cwd = input.roaming.enabled && input.roamingWorkDir ? input.roamingWorkDir : input.defaultWorkDir;
  if (input.type === "codex") {
    await ensureDir(cwd);
  } else {
    await ensureDir(cwd);
  }
  const { command, args, env } = await buildCommand({
    type: input.type,
    prompt: input.prompt,
    roaming: input.roaming
  });
  try {
    const startInfo = { type: input.type, command, args, cwd, timeoutMs, env };
    (_a = input.onStart) == null ? void 0 : _a.call(input, startInfo);
    const res = await runProcess({ command, args, cwd, env, timeoutMs });
    const exec = { ...startInfo, ...res };
    const out = normalizeOutput(res.stdout || res.stderr);
    return { text: out, exec };
  } catch (e) {
    if (isEnoent(e)) {
      throw new Error(`Command not found: ${command}. Is the ${input.type} CLI installed and on PATH?`);
    }
    throw e;
  }
}
async function buildCommand(opts) {
  const { type, prompt, roaming } = opts;
  if (type === "codex") {
    const args2 = ["exec", "--ephemeral", "--skip-git-repo-check"];
    if (roaming.enabled) {
      args2.push("--full-auto");
      args2.push("--sandbox", roaming.mode === "yolo" ? "danger-full-access" : "workspace-write");
    }
    args2.push(prompt);
    return { command: "codex", args: args2 };
  }
  if (type === "claude") {
    const args2 = ["-p", prompt, "--output-format", "text"];
    if (roaming.enabled) {
      args2.push("--dangerously-skip-permissions");
      args2.push("--allowedTools", "Bash,Read,Write");
    } else {
      args2.push("--permission-mode", "plan");
    }
    return { command: "claude", args: args2 };
  }
  const args = ["-p", prompt, "--output-format", "text"];
  if (roaming.enabled) {
    args.push("--yolo");
  }
  return { command: "gemini", args };
}
class AgentService {
  constructor(opts) {
    __publicField(this, "userDataPath");
    __publicField(this, "chatStore");
    __publicField(this, "chatsRoot");
    __publicField(this, "debugLogStore");
    __publicField(this, "onRunStatus");
    this.userDataPath = opts.userDataPath;
    this.chatStore = opts.chatStore;
    this.chatsRoot = getDataPaths(this.userDataPath).chatsRoot;
    this.debugLogStore = opts.debugLogStore;
    this.onRunStatus = opts.onRunStatus;
  }
  async runAgent(chatId, participantId, runOpts = {}) {
    const chat = await this.chatStore.getChat(chatId);
    const participant = chat.participants.find((p) => p.id === participantId);
    if (!participant) throw new Error(`Unknown participant: ${participantId}`);
    const messages = await this.chatStore.listMessages(chatId, 200);
    const msg = await this.buildAgentMessage({ chatId, participantId, messagesSnapshot: messages, runOpts });
    await this.chatStore.appendMessage(chatId, msg);
    return msg;
  }
  async buildAgentMessage(opts) {
    var _a, _b, _c, _d;
    const { chatId, participantId, messagesSnapshot, runOpts } = opts;
    const chat = await this.chatStore.getChat(chatId);
    const participant = chat.participants.find((p) => p.id === participantId);
    if (!participant) throw new Error(`Unknown participant: ${participantId}`);
    const prompt = buildAgentPrompt({ chat, participant, messages: messagesSnapshot });
    const defaultWorkDir = chatWorkspaceDir(this.chatsRoot, chatId);
    await ensureDir(defaultWorkDir);
    const roamingWorkDir = participant.roaming.enabled ? participant.roaming.workspaceDir : void 0;
    let text;
    const runId = newId("run");
    let debugRun;
    try {
      const detailed = await runProviderDetailed({
        type: participant.type,
        prompt,
        roaming: participant.roaming,
        defaultWorkDir,
        roamingWorkDir,
        onStart: (info) => {
          var _a2, _b2;
          const started = {
            id: runId,
            chatId,
            participantId: participant.id,
            participantDisplayName: participant.displayName,
            provider: participant.type,
            trigger: runOpts.trigger ?? "manual",
            triggeredByMessageId: runOpts.triggeredByMessageId,
            tagSessionIndex: runOpts.tagSessionIndex,
            status: "running",
            tsStart: nowIso(),
            command: info.command,
            args: info.args,
            cwd: info.cwd,
            timeoutMs: info.timeoutMs,
            roaming: participant.roaming,
            promptLength: prompt.length,
            promptPreview: prompt.slice(0, 4e3)
          };
          debugRun = started;
          (_a2 = this.debugLogStore) == null ? void 0 : _a2.upsertRun(chatId, started);
          (_b2 = this.onRunStatus) == null ? void 0 : _b2.call(this, {
            runId,
            chatId,
            participantId: participant.id,
            participantDisplayName: participant.displayName,
            status: "running",
            ts: nowIso(),
            provider: participant.type
          });
        }
      });
      text = detailed.text;
      if (detailed.exec.timedOut) {
        const timeoutMsg = `${participant.type} timed out after ${Math.round(detailed.exec.timeoutMs / 1e3)}s`;
        if (!text) text = timeoutMsg;
        if (debugRun) debugRun.error = timeoutMsg;
      } else if ((detailed.exec.exitCode ?? 0) !== 0 && !text) {
        const exitMsg = `${participant.type} exited with code ${detailed.exec.exitCode}`;
        text = exitMsg;
        if (debugRun) debugRun.error = exitMsg;
      }
      if (debugRun) {
        const run = debugRun;
        const finished = {
          ...run,
          status: detailed.exec.timedOut ? "timeout" : "finished",
          tsEnd: nowIso(),
          stdout: detailed.exec.stdout,
          stderr: detailed.exec.stderr,
          exitCode: detailed.exec.exitCode,
          timedOut: detailed.exec.timedOut,
          signal: detailed.exec.signal
        };
        (_a = this.debugLogStore) == null ? void 0 : _a.upsertRun(chatId, finished);
      }
      (_b = this.onRunStatus) == null ? void 0 : _b.call(this, {
        runId,
        chatId,
        participantId: participant.id,
        participantDisplayName: participant.displayName,
        status: detailed.exec.timedOut ? "timeout" : "finished",
        ts: nowIso(),
        provider: participant.type
      });
    } catch (e) {
      const msg2 = e instanceof Error ? e.message : String(e);
      text = `Error running ${participant.type}: ${msg2}`;
      const errRun = debugRun ?? {
        id: runId,
        chatId,
        participantId: participant.id,
        participantDisplayName: participant.displayName,
        provider: participant.type,
        trigger: runOpts.trigger ?? "manual",
        triggeredByMessageId: runOpts.triggeredByMessageId,
        tagSessionIndex: runOpts.tagSessionIndex,
        status: "error",
        tsStart: nowIso(),
        command: participant.type,
        args: [],
        cwd: roamingWorkDir ?? defaultWorkDir,
        timeoutMs: participant.roaming.enabled ? 24e4 : 9e4,
        roaming: participant.roaming,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 4e3)
      };
      (_c = this.debugLogStore) == null ? void 0 : _c.upsertRun(chatId, { ...errRun, status: "error", tsEnd: nowIso(), error: msg2 });
      (_d = this.onRunStatus) == null ? void 0 : _d.call(this, {
        runId,
        chatId,
        participantId: participant.id,
        participantDisplayName: participant.displayName,
        status: "error",
        ts: nowIso(),
        provider: participant.type
      });
    }
    const msg = {
      id: newId("m"),
      ts: nowIso(),
      authorKind: "agent",
      authorId: participant.id,
      authorDisplayName: participant.displayName,
      text,
      meta: {
        trigger: runOpts.trigger ?? "manual",
        triggeredByMessageId: runOpts.triggeredByMessageId,
        tagSessionIndex: runOpts.tagSessionIndex,
        provider: participant.type
      }
    };
    return msg;
  }
}
const EVERYONE_TOKEN = "@everyone";
function isBoundaryChar(ch) {
  return /\s|[([{'"`]|[.,;:!?]/.test(ch);
}
function hasTokenAt(lower, text, start, tokenLower) {
  if (!lower.startsWith(tokenLower, start)) return false;
  const end = start + tokenLower.length;
  if (end < text.length && !isBoundaryChar(text[end])) return false;
  return true;
}
function extractMentionedParticipantIds(text, participants) {
  const candidates = [];
  for (const p of participants) {
    candidates.push({
      participantId: p.id,
      token: `@${p.handle}`,
      tokenLower: `@${p.handle}`.toLowerCase()
    });
    const dn = p.displayName.trim();
    if (dn) {
      candidates.push({
        participantId: p.id,
        token: `@${dn}`,
        tokenLower: `@${dn}`.toLowerCase()
      });
    }
  }
  candidates.sort((a, b) => b.token.length - a.token.length);
  const mentioned = /* @__PURE__ */ new Set();
  const lower = text.toLowerCase();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue;
    if (i > 0 && !isBoundaryChar(text[i - 1])) continue;
    if (hasTokenAt(lower, text, i, EVERYONE_TOKEN)) {
      for (const p of participants) mentioned.add(p.id);
      i += EVERYONE_TOKEN.length - 1;
      continue;
    }
    for (const c of candidates) {
      if (hasTokenAt(lower, text, i, c.tokenLower)) {
        mentioned.add(c.participantId);
        i += c.token.length - 1;
        break;
      }
    }
  }
  return mentioned;
}
class MentionEngine {
  constructor(opts) {
    __publicField(this, "chatStore");
    __publicField(this, "agentService");
    __publicField(this, "onMessageAppended");
    __publicField(this, "onMentionState");
    __publicField(this, "perChatQueue", /* @__PURE__ */ new Map());
    __publicField(this, "pendingByChat", /* @__PURE__ */ new Map());
    this.chatStore = opts.chatStore;
    this.agentService = opts.agentService;
    this.onMessageAppended = opts.onMessageAppended;
    this.onMentionState = opts.onMentionState;
  }
  /**
   * Runs up to 3 mention-triggered sessions (rounds).
   * Each session runs triggered agents in parallel against a transcript snapshot,
   * and appends each reply as soon as it completes.
   */
  async runFromTriggerMessage(chatId, triggerMessage, maxSessions = 3) {
    var _a;
    this.pendingByChat.delete(chatId);
    (_a = this.onMentionState) == null ? void 0 : _a.call(this, chatId, false, []);
    return this.enqueue(chatId, () => this.runFromTriggerMessageInternal(chatId, triggerMessage, maxSessions));
  }
  async resume(chatId, maxSessions = 3) {
    return this.enqueue(chatId, () => this.resumeInternal(chatId, maxSessions));
  }
  async resumeInternal(chatId, maxSessions) {
    const pending = this.pendingByChat.get(chatId);
    if (!pending || pending.size === 0) return { appended: [], paused: false, pendingParticipantIds: [] };
    const chat = await this.chatStore.getChat(chatId);
    const currentTriggers = new Map(pending);
    this.pendingByChat.delete(chatId);
    return this.runSessions(chatId, chat, currentTriggers, maxSessions);
  }
  async runFromTriggerMessageInternal(chatId, triggerMessage, maxSessions) {
    const chat = await this.chatStore.getChat(chatId);
    const currentTriggers = /* @__PURE__ */ new Map();
    const initialMentioned = extractMentionedParticipantIds(triggerMessage.text, chat.participants);
    for (const pid of initialMentioned) {
      if (triggerMessage.authorKind === "agent" && triggerMessage.authorId === pid) continue;
      currentTriggers.set(pid, triggerMessage.id);
    }
    return this.runSessions(chatId, chat, currentTriggers, maxSessions);
  }
  async runSessions(chatId, chat, currentTriggersInput, maxSessions) {
    var _a, _b;
    const appended = [];
    let currentTriggers = currentTriggersInput;
    for (let sessionIndex = 1; sessionIndex <= maxSessions; sessionIndex++) {
      if (currentTriggers.size === 0) break;
      const snapshot = await this.chatStore.listMessages(chatId, 200);
      const triggersThisSession = [...currentTriggers.entries()];
      const pending = triggersThisSession.map(([participantId, triggeredByMessageId]) => {
        const promise = this.agentService.buildAgentMessage({
          chatId,
          participantId,
          messagesSnapshot: snapshot,
          runOpts: {
            trigger: "mention",
            triggeredByMessageId,
            tagSessionIndex: sessionIndex
          }
        });
        return { promise };
      });
      const replies = [];
      const remaining = [...pending];
      while (remaining.length > 0) {
        const raced = await Promise.race(
          remaining.map(
            (p) => p.promise.then((msg) => ({ pending: p, msg }))
          )
        );
        const idx = remaining.indexOf(raced.pending);
        if (idx >= 0) remaining.splice(idx, 1);
        await this.chatStore.appendMessage(chatId, raced.msg);
        appended.push(raced.msg);
        replies.push(raced.msg);
        (_a = this.onMessageAppended) == null ? void 0 : _a.call(this, chatId, raced.msg);
      }
      const nextTriggers = /* @__PURE__ */ new Map();
      for (const reply of replies) {
        const mentioned = extractMentionedParticipantIds(reply.text, chat.participants);
        for (const pid of mentioned) {
          if (reply.authorKind === "agent" && reply.authorId === pid) continue;
          if (!nextTriggers.has(pid)) nextTriggers.set(pid, reply.id);
        }
      }
      currentTriggers = nextTriggers;
    }
    const paused = currentTriggers.size > 0;
    if (paused) this.pendingByChat.set(chatId, currentTriggers);
    (_b = this.onMentionState) == null ? void 0 : _b.call(this, chatId, paused, [...currentTriggers.keys()]);
    return { appended, paused, pendingParticipantIds: [...currentTriggers.keys()] };
  }
  enqueue(chatId, fn) {
    const prev = this.perChatQueue.get(chatId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.perChatQueue.set(chatId, next);
    next.finally(() => {
      if (this.perChatQueue.get(chatId) === next) this.perChatQueue.delete(chatId);
    }).catch(() => void 0);
    return next;
  }
}
class DebugLogStore {
  constructor(maxRunsPerChat = 50) {
    __publicField(this, "runsByChat", /* @__PURE__ */ new Map());
    __publicField(this, "maxRunsPerChat");
    this.maxRunsPerChat = maxRunsPerChat;
  }
  listRuns(chatId) {
    const runs = this.runsByChat.get(chatId) ?? [];
    return [...runs].sort((a, b) => b.tsStart.localeCompare(a.tsStart));
  }
  clearRuns(chatId) {
    this.runsByChat.delete(chatId);
  }
  upsertRun(chatId, run) {
    const existing = this.runsByChat.get(chatId) ?? [];
    const idx = existing.findIndex((r) => r.id === run.id);
    if (idx >= 0) existing[idx] = run;
    else existing.push(run);
    if (existing.length > this.maxRunsPerChat) existing.splice(0, existing.length - this.maxRunsPerChat);
    this.runsByChat.set(chatId, existing);
  }
}
function registerIpcHandlers(opts) {
  const { chatStore: chatStore2, getFocusedWindow, userDataPath } = opts;
  const debugLogStore = new DebugLogStore();
  const broadcast = (channel, payload) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(channel, payload);
    }
  };
  const emitMessageAppended = (chatId, message) => {
    broadcast(IpcChannels.MessagesAppended, { chatId, message });
  };
  const emitMentionState = (chatId, mentionPaused, pendingMentionParticipantIds = []) => {
    broadcast(IpcChannels.MentionState, { chatId, mentionPaused, pendingMentionParticipantIds });
  };
  const agentService = new AgentService({
    userDataPath,
    chatStore: chatStore2,
    debugLogStore,
    onRunStatus: (evt) => broadcast(IpcChannels.AgentRunStatus, evt)
  });
  const mentionEngine = new MentionEngine({
    chatStore: chatStore2,
    agentService,
    onMessageAppended: (chatId, message) => emitMessageAppended(chatId, message),
    onMentionState: (chatId, paused, pendingParticipantIds) => emitMentionState(chatId, paused, pendingParticipantIds)
  });
  ipcMain.handle(IpcChannels.ChatsList, async () => {
    return chatStore2.listChats();
  });
  ipcMain.handle(IpcChannels.ChatsCreate, async (_evt, input) => {
    return chatStore2.createChat(input);
  });
  ipcMain.handle(IpcChannels.ChatsGet, async (_evt, chatId) => {
    return chatStore2.getChat(chatId);
  });
  ipcMain.handle(IpcChannels.ChatsUpdate, async (_evt, input) => {
    return chatStore2.updateChat(input);
  });
  ipcMain.handle(IpcChannels.MessagesList, async (_evt, input) => {
    return chatStore2.listMessages(input.chatId, input.limit);
  });
  ipcMain.handle(IpcChannels.MessagesAppendUser, async (_evt, chatId, text) => {
    const msg = {
      id: newId("m"),
      ts: nowIso(),
      authorKind: "user",
      authorId: "user",
      authorDisplayName: "You",
      text,
      meta: { trigger: "manual" }
    };
    await chatStore2.appendMessage(chatId, msg);
    emitMessageAppended(chatId, msg);
    emitMentionState(chatId, false, []);
    mentionEngine.runFromTriggerMessage(chatId, msg, 3).catch((err) => {
      console.error("Mention engine failed after user message", err);
      emitMentionState(chatId, false, []);
    });
    const result = {
      messages: [msg],
      mentionPaused: false,
      pendingMentionParticipantIds: []
    };
    return result;
  });
  ipcMain.handle(IpcChannels.MessagesDelete, async (_evt, chatId, messageId) => {
    await chatStore2.deleteMessage(chatId, messageId);
  });
  ipcMain.handle(IpcChannels.AgentsRun, async (_evt, chatId, participantId, options) => {
    const msg = await agentService.runAgent(chatId, participantId, options ?? {});
    emitMessageAppended(chatId, msg);
    emitMentionState(chatId, false, []);
    mentionEngine.runFromTriggerMessage(chatId, msg, 3).catch((err) => {
      console.error("Mention engine failed after manual agent run", err);
      emitMentionState(chatId, false, []);
    });
    const result = {
      messages: [msg],
      mentionPaused: false,
      pendingMentionParticipantIds: []
    };
    return result;
  });
  ipcMain.handle(IpcChannels.MentionsResume, async (_evt, chatId) => {
    emitMentionState(chatId, false, []);
    mentionEngine.resume(chatId, 3).catch((err) => {
      console.error("Mention engine failed while resuming", err);
      emitMentionState(chatId, false, []);
    });
    const result = {
      messages: [],
      mentionPaused: false,
      pendingMentionParticipantIds: []
    };
    return result;
  });
  ipcMain.handle(IpcChannels.DebugRunsList, async (_evt, chatId) => {
    return debugLogStore.listRuns(chatId);
  });
  ipcMain.handle(IpcChannels.DebugRunsClear, async (_evt, chatId) => {
    debugLogStore.clearRuns(chatId);
  });
  ipcMain.handle(IpcChannels.DialogPickDirectory, async () => {
    const win2 = getFocusedWindow();
    const options = {
      properties: ["openDirectory"],
      title: "Choose a workspace directory"
    };
    const res = win2 ? await dialog.showOpenDialog(win2, options) : await dialog.showOpenDialog(options);
    if (res.canceled) return null;
    return res.filePaths[0] ?? null;
  });
}
function splitPathEntries(value) {
  if (!value) return [];
  return value.split(path.delimiter).map((p) => p.trim()).filter(Boolean);
}
function uniq(entries) {
  return [...new Set(entries)];
}
function platformFallbackPaths() {
  if (process.platform === "darwin") {
    return ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  }
  if (process.platform === "linux") {
    return ["/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin"];
  }
  return [];
}
async function getLoginShellPath() {
  if (process.platform === "win32") return void 0;
  const shell = process.env.SHELL || "/bin/zsh";
  return new Promise((resolve) => {
    const child = spawn(shell, ["-ilc", 'printf "%s" "$PATH"'], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4e3
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", () => resolve(void 0));
    child.on("close", () => {
      const value = out.trim();
      resolve(value || void 0);
    });
  });
}
async function initializeProcessPath() {
  const home = process.env.HOME;
  const fromEnv = splitPathEntries(process.env.PATH);
  const fromShell = splitPathEntries(await getLoginShellPath());
  const fromFallback = platformFallbackPaths();
  const fromHome = home ? [`${home}/.local/bin`, `${home}/bin`] : [];
  process.env.PATH = uniq([...fromEnv, ...fromShell, ...fromFallback, ...fromHome]).join(path.delimiter);
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
let chatStore = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1200,
    minWidth: 1100,
    minHeight: 800,
    backgroundColor: "#0b1220",
    show: false,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(async () => {
  await initializeProcessPath();
  const userDataPath = app.getPath("userData");
  chatStore = new ChatStore(userDataPath);
  await chatStore.init();
  registerIpcHandlers({
    chatStore,
    userDataPath,
    getFocusedWindow: () => BrowserWindow.getFocusedWindow()
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
