import { tr } from '../i18n.ts'
export type SayState = 'idle' | 'on' | 'mute'

/**
 * The thing you press to hear a name, struck through when the machine came
 * back silent. Drawn rather than implied: the name was clickable all along,
 * which nobody could tell by looking at it.
 */
export function SayButton({
  state,
  onClick,
  className,
}: {
  state: SayState
  onClick: () => void
  className?: string
}) {
  return (
    <button
      className={`say${state === 'idle' ? '' : ` say--${state}`}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      title={state === 'mute' ? tr('这台机器上没有能读英语的语音', 'No English voice is installed on this machine.') : tr('朗读', 'Say it')}
      aria-label={tr('朗读', 'Say it')}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M2 6.2h2.6L7.8 3.4v9.2L4.6 9.8H2z" fill="currentColor" />
        {state === 'mute' ? (
          <path
            d="M10.4 6.2l3.4 3.6M13.8 6.2l-3.4 3.6"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          <path
            d="M10.2 5.9a3.4 3.4 0 010 4.2M12.4 3.9a6.2 6.2 0 010 8.2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>
    </button>
  )
}
