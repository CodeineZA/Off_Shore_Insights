import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './panels.css';
import './map.css';
import './report.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
