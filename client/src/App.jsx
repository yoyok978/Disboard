import React, { useEffect, useState } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { setupDiscordSdk } from './discord';
import { useYjsStore } from './useYjsStore';

function Whiteboard({ roomId }) {
    // Determine the WebSocket URL based on the environment
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // For local dev, use the Vite proxy. For production (Vercel), use the live Render URL.
    const HOST_URL = isLocalhost
        ? `ws://${window.location.host}/ws`
        : 'wss://disboard-xb6e.onrender.com';

    const { store, status } = useYjsStore({ roomId, hostUrl: HOST_URL });

    if (status === 'loading') {
        return <div style={{ color: 'white', padding: 20 }}>Connecting to Disboard Engine...</div>;
    }

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Tldraw store={store} />
        </div>
    );
}

function App() {
    const [roomId, setRoomId] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setupDiscordSdk()
            .then((id) => setRoomId(id))
            .catch((err) => {
                console.error("SDK Setup failed", err);
                setRoomId('test-room');
            });
    }, []);

    if (error) {
        return <div style={{ color: 'white', padding: 20 }}>Error: {error.message}</div>;
    }

    if (!roomId) {
        return <div style={{ color: 'white', padding: 20 }}>Initializing Disboard SDK...</div>;
    }

    return <Whiteboard roomId={roomId} />;
}

export default App;
