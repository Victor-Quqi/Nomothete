/**
 * Say a name out loud.
 *
 * A name gets said in a standup long before anyone types it, and English does
 * not write down where the stress falls — Orièl and Òriel are the same eight
 * characters. The browser voice is crude; hearing which one you meant is still
 * worth one keystroke.
 */

/**
 * The best English voice on the machine, installed ones first.
 *
 * English or nothing: a zh-CN voice reading Latin letters puts no stress
 * anywhere, and stress is what the click was asking about.
 *
 * Local before online because Edge 153 sends a voice's display name where the
 * service expects its identifier — every online voice it lists comes back
 * synthesis-failed, and voiceURI is read-only, so a page has no lever.
 */
function englishVoice(): SpeechSynthesisVoice | null {
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase() === 'en-us' ? 0 : 1) + (v.localService ? 0 : 2)
  return (
    window.speechSynthesis
      .getVoices()
      .filter(v => v.lang.toLowerCase().startsWith('en'))
      .sort((a, b) => score(a) - score(b))[0] ?? null
  )
}

/**
 * Whether the last attempt came back silent.
 *
 * A fact about the machine, not about the name, so the struck speaker follows
 * whichever name is in front of you. A record, not a gate — every click still
 * asks, so the mark clears itself the moment the machine can speak.
 */
let mute = false
export const isMute = () => mute

/**
 * Say it, and report whether it was actually heard.
 *
 * Which voice works is only found out by asking, and the caller is showing the
 * answer either way, so nothing is cached per voice.
 */
export function speakName(name: string, done: (heard: boolean) => void) {
  const report = (heard: boolean) => {
    mute = !heard
    done(heard)
  }

  const synth = window.speechSynthesis
  const voice = synth && englishVoice()
  if (!voice) {
    report(false)
    return
  }

  if (synth.speaking || synth.pending) synth.cancel()
  const utterance = new SpeechSynthesisUtterance(name)
  utterance.voice = voice
  utterance.lang = voice.lang
  utterance.rate = 0.88

  let heard = false
  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    report(heard)
  }
  utterance.onstart = () => {
    heard = true
  }
  utterance.onend = settle
  utterance.onerror = settle
  synth.speak(utterance)
  // A failure can also arrive as no event at all. Anything not started by now
  // is not going to; anything that has can be left to end on its own.
  setTimeout(() => {
    if (!heard) settle()
  }, 1500)
}

// The list is built asynchronously and the first call after load comes back
// empty. Ask now, so there is an answer by the time there is a name to click.
window.speechSynthesis?.getVoices()
