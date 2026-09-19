/**
 * The label a session wears in the rail.
 *
 * A brief is a sentence; a list needs a handle. Cutting the sentence short only
 * prints the same words in a smaller box with the end missing, so the label is
 * written rather than trimmed — which takes something that can read the
 * sentence, and the app already has one on the other end of the wire.
 *
 * Failure is silent by design: no model configured, no key, no answer in a
 * minute, and the session simply stays unlabelled. Everywhere a title is shown
 * falls back to the brief, so nothing is missing — it is just longer.
 */
import { generateText } from 'ai'
import { publish } from '../events.ts'
import { activeProfile, resolveModel } from '../llm.ts'
import { getSession, setSessionTitle } from '../store.ts'

const TIMEOUT_MS = 60_000

/** Long enough to be a sentence again, and a sentence is what we are avoiding. */
const MAX_CHARS = 30

/** One ask per session per process, however many browsers open it. */
const asked = new Set<string>()

function hasCJK(s: string) {
  return /[㐀-鿿豈-﫿]/.test(s)
}

function clean(raw: string): string {
  const t = raw
    .split('\n')[0]
    .trim()
    .replace(/^[`'"“”‘’「『【\[(]+|[`'"“”‘’」』】\])。.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > MAX_CHARS ? '' : t
}

export async function nameSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session || session.title || !session.brief.trim()) return
  if (asked.has(sessionId)) return
  asked.add(sessionId)

  try {
    const chinese = hasCJK(session.brief)
    const { text } = await generateText({
      model: resolveModel(activeProfile()),
      system: 'You write short labels. Answer with the label itself and nothing else.',
      prompt: [
        `THE PROJECT\n${session.brief.trim()}`,
        '',
        'Label this project the way someone would refer to it in a list of ten others they are working on.',
        'A noun phrase. No punctuation, no quotation marks, no trailing period.',
        'This is not the project\'s name — naming it is the work that happens inside; you are labelling the folder it happens in, so plain descriptive words are right.',
        chinese ? '用简体中文，最多 8 个汉字。' : 'Answer in English, at most four words.',
      ].join('\n'),
      temperature: 0.3,
      // No output cap: a reasoning model spends hundreds of tokens thinking
      // before the eight it answers with, and a cap sized for the answer cuts
      // it off mid-thought — which arrives here as an empty string, silently.
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const title = clean(text)
    if (!title) return
    // The brief may have been edited, or a person may have named it themselves,
    // in the seconds this took.
    const now = getSession(sessionId)
    if (!now || now.title) return
    setSessionTitle(sessionId, title)
    publish(sessionId, { type: 'session:title', title })
  } catch {
    // Unlabelled is a state the UI already draws.
  }
}
