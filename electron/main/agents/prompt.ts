import type { Chat, Message, Participant } from '../../../shared/types'

function formatRoster(chat: Chat): string {
  return chat.participants
    .map((p) => `- ${p.displayName} (@${p.handle}): ${oneLine(p.persona)}`)
    .join('\n')
}

function oneLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function formatTranscript(chat: Chat, messages: Message[], limitChars: number): string {
  // Keep prompts under typical CLI arg limits by truncating from the start.
  const idToHandle = new Map(chat.participants.map((p) => [p.id, p.handle]))
  const lines = messages.map((m) => {
    if (m.authorKind === 'agent') {
      const handle = idToHandle.get(m.authorId) ? ` (@${idToHandle.get(m.authorId)})` : ''
      return `**${m.authorDisplayName}${handle}**: ${m.text}`
    }
    return `**${m.authorDisplayName}**: ${m.text}`
  })
  let out = lines.join('\n')
  if (out.length <= limitChars) return out
  // Keep the tail.
  out = out.slice(out.length - limitChars)
  return `…(truncated)\n${out}`
}

export function buildAgentPrompt(opts: {
  chat: Chat
  participant: Participant
  messages: Message[]
}): string {
  const { chat, participant, messages } = opts

  const prompt = [
    '# Role',
    participant.persona.trim(),
    '',
    '# Chat Context',
    chat.context.trim() || '(No context provided.)',
    '',
    '# Participants',
    formatRoster(chat) || '(No other participants.)',
    '',
    '# Instructions',
    `- You are ${participant.displayName} (@${participant.handle}). Respond in character.`,
    '- Write a single chat message that moves the discussion forward.',
    '- Be concise unless more detail is necessary to be correct.',
    '- Do not @mention others unless you actually need their input or you are directly responding to them.',
    '- If you do @mention someone, mention them at most once per message (or use @everyone to address all agents).',
    '- Output only the message body (no prefix like "Name:").',
    participant.roaming.enabled
      ? '- You may read files and run commands in the configured workspace directory if needed for accuracy.'
      : '- Do not claim you ran commands or read files; you do not have workspace access in this mode.',
    '',
    '# Transcript',
    formatTranscript(chat, messages, 25_000),
    '',
    '# Your turn',
  ].join('\n')

  return prompt
}
