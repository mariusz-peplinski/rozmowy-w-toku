import type { Participant, ParticipantId } from '../../../shared/types'

type MentionCandidate = {
  participantId: ParticipantId
  token: string
  tokenLower: string
}

function isBoundaryChar(ch: string): boolean {
  return /\s|[([{'"`]|[.,;:!?]/.test(ch)
}

export function extractMentionedParticipantIds(text: string, participants: Participant[]): Set<ParticipantId> {
  const candidates: MentionCandidate[] = []
  for (const p of participants) {
    candidates.push({
      participantId: p.id,
      token: `@${p.handle}`,
      tokenLower: `@${p.handle}`.toLowerCase(),
    })

    // DisplayName mentions are less robust but user-friendly.
    const dn = p.displayName.trim()
    if (dn) {
      candidates.push({
        participantId: p.id,
        token: `@${dn}`,
        tokenLower: `@${dn}`.toLowerCase(),
      })
    }
  }

  // Prefer the longest token first to avoid partial matches.
  candidates.sort((a, b) => b.token.length - a.token.length)

  const mentioned = new Set<ParticipantId>()
  const lower = text.toLowerCase()

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue
    if (i > 0 && !isBoundaryChar(text[i - 1]!)) continue

    for (const c of candidates) {
      if (lower.startsWith(c.tokenLower, i)) {
        mentioned.add(c.participantId)
        // Move index forward to avoid O(n*m) worst-cases on long messages.
        i += c.token.length - 1
        break
      }
    }
  }

  return mentioned
}

