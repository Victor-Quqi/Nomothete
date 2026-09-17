/**
 * Say a name out loud.
 *
 * A name gets said in a standup long before anyone types it, and English does
 * not write down where the stress falls — Orièl and Òriel are the same eight
 * characters. The browser voice is crude; hearing which one you meant is still
 * worth one keystroke.
 */
export function speakName(name: string, onDone?: () => void): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(name)
  utterance.lang = 'en-US'
  utterance.rate = 0.88
  utterance.onend = () => onDone?.()
  utterance.onerror = () => onDone?.()
  synth.speak(utterance)
  return true
}
