import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 🚨 REACT STRICT MODE REMOVED
// We removed <StrictMode> to prevent Firebase's offline IndexedDB cache 
// from corrupting itself during Vite hot-reloads and tab switching.

createRoot(document.getElementById('root')!).render(
  <App />
)
