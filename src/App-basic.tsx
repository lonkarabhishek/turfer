export default function App() {
  return (
    <div>
      <h1>Basic App Test - Port 3000</h1>
      <p>If you see this, the issue is with our components</p>
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#f0f0f0', 
        margin: '20px',
        borderRadius: '8px' 
      }}>
        <h2>Debug Info:</h2>
        <ul>
          <li>React: Working ✅</li>
          <li>Port: 3000 ✅</li>
          <li>Basic rendering: ✅</li>
        </ul>
      </div>
    </div>
  );
}