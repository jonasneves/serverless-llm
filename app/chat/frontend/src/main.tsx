import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import Playground from './Playground'
import BenchmarkPage from './BenchmarkPage'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import './index.css'
import './backgrounds.css'

function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash === '#/benchmark') return <BenchmarkPage />;
  return <Playground />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
