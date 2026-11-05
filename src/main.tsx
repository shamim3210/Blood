import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initRuntimeSecurityShield } from './utils/securityShield';
import { initPWAInstallListener } from './hooks/usePWAInstall';
import { initAppUpdateManager } from './utils/appUpdateManager';

initRuntimeSecurityShield();
initPWAInstallListener();
initAppUpdateManager();

createRoot(document.getElementById('root')!).render(<App />);
