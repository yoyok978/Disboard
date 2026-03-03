import React, { useEffect, useState } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { setupDiscordSdk } from './discord';
import { useYjsStore } from './useYjsStore';

function Whiteboard({ roomId }) {
    // Connect to the same host but with ws/wss protocol for the proxy instead
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss:' : 'ws:';
    const HOST_URL = import.meta.env.VITE_WEBSOCKET_URL || `${wsProtocol}//${window.location.host}/ws`;

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
