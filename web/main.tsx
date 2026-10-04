import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { lang } from './i18n.ts'
import './styles.css'

document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
document.title = lang === 'zh' ? 'Nomothete · 立名者' : 'Nomothete'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
