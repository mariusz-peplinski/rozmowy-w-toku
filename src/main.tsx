import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Set theme before the first paint to avoid a flash of unthemed UI.
const savedTheme = localStorage.getItem('theme')
document.documentElement.dataset.theme = savedTheme === 'light' ? 'light' : 'dark'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
