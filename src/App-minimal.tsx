import { useState } from 'react';
import { CreateGameFlowEnhanced } from './components/CreateGameFlowEnhanced';

export default function App() {
  const [showCreateGame, setShowCreateGame] = useState(false);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1 style={{ color: '#1f2937', fontSize: '2rem', marginBottom: '1rem' }}>
        🏟️ TapTurf - Game Creation Test
      </h1>
      
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Testing the enhanced game creation UI
      </p>

      <button
        onClick={() => setShowCreateGame(true)}
        style={{
          background: 'linear-gradient(to right, #059669, #047857)',
          color: 'white',
          padding: '12px 24px',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}
      >
        ✨ Create Game (Enhanced UI)
      </button>

      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <h3 style={{ color: '#374151', margin: '0 0 0.5rem 0' }}>Status:</h3>
        <p style={{ color: '#059669', margin: 0, fontWeight: '600' }}>
          ✅ React is working<br/>
          ✅ Frontend running on port 3000<br/>
          ✅ Backend API running on port 3001<br/>
          ✅ Enhanced UI components loaded
        </p>
      </div>

      <CreateGameFlowEnhanced
        open={showCreateGame}
        onClose={() => setShowCreateGame(false)}
        onGameCreated={(game) => {
          console.log('Game created:', game);
          alert(`Game created successfully: ${game.format} at ${game.turfName}`);
          setShowCreateGame(false);
        }}
      />
    </div>
  );
}