import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register Progressive Web App Service Worker for offline shell & installability
registerSW({
  immediate: true,
  onRegisterError(error) {
    // Non-fatal in restricted iframe environments; app continues normally
    console.info('PWA service worker registration skipped:', error);
  },
});

createRoot(document.getElementById('root')!).render(<App />);
