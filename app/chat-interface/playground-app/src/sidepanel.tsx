import React from 'react';
import ReactDOM from 'react-dom/client';
import ServerPanel from './components/ServerPanel';
import './index.css';
import './playground.css';

ReactDOM.createRoot(document.getElementById('sidepanel-root')!).render(
  <React.StrictMode>
    <ServerPanel />
  </React.StrictMode>,
);
