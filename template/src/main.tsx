import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reportPathToStudio } from './lib/studio-bridge'

if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.classList.add('dark')

reportPathToStudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
