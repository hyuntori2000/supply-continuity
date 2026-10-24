import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {AccessGate} from './components/access-gate';
import './styles.css';
import 'leaflet/dist/leaflet.css';
createRoot(document.getElementById('root')!).render(<StrictMode><AccessGate><App/></AccessGate></StrictMode>);
