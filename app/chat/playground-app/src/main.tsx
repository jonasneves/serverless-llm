import React from 'react'
import ReactDOM from 'react-dom/client'
import Playground from './Playground'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import './index.css'
import './backgrounds.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Playground />
  </React.StrictMode>,
)
