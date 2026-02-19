import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Set theme before the first paint to avoid a flash of unthemed UI.
const savedTheme = localStorage.getItem('theme')
const initialTheme = savedTheme === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = initialTheme
document.documentElement.classList.toggle('dark', initialTheme === 'dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
