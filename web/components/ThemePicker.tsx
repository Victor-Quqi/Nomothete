import { tr } from '../i18n.ts'
import { THEME_LABEL, type ThemeChoice } from '../theme.ts'

const THEMES: ThemeChoice[] = ['system', 'light', 'dark']

export function ThemePicker({ value, onChange }: {
  value: ThemeChoice
  onChange: (theme: ThemeChoice) => void
}) {
  return (
    <div className="theme-pick" role="group" aria-label={tr('外观', 'Appearance')}>
      {THEMES.map(theme => (
        <button key={theme} type="button" aria-pressed={value === theme} onClick={() => onChange(theme)}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {theme === 'system' && <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>}
            {theme === 'light' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>}
            {theme === 'dark' && <path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3a8.5 8.5 0 1 0 10 10.5Z" />}
          </svg>
          <span>{THEME_LABEL[theme]}</span>
        </button>
      ))}
    </div>
  )
}
