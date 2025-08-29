import React from 'react'
import ReactDOM from 'react-dom/client'

function TestApp() {
  return (
    <div style={{ padding: '20px', fontSize: '24px', color: 'red' }}>
      <h1>React Test App Working!</h1>
      <p>If you can see this, React is working.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TestApp />
  </React.StrictMode>,
)