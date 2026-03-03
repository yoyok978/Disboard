import React, { useEffect, useState } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { setupDiscordSdk } from './discord';
import { useYjsStore } from './useYjsStore';

import { getAssetUrls } from '@tldraw/assets/selfHosted';

function Whiteboard({ roomId }) {
    // Determine the WebSocket URL.
    // If we are developing locally (either on localhost OR via the trycloudflare.com tunnel),
    // we should use the local Vite proxy. Wait to use Render until actually deployed on Vercel.
    const isLocalDevelopment = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.trycloudflare.com');

    const isDiscord = window.location.hostname.endsWith('.discordsays.com');

    // For local dev/tunnel, use the Vite proxy. For production (Vercel), use the live Render URL.
    // If the browser is on https (Cloudflare tunnel), use wss. If http (localhost), use ws.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const HOST_URL = (isLocalDevelopment || isDiscord)
        ? `${wsProtocol}//${window.location.host}/ws`
        : 'wss://disboard-xb6e.onrender.com';

    const { store, status } = useYjsStore({ roomId, hostUrl: HOST_URL });

    if (status === 'loading') {
        return <div style={{ color: 'white', padding: 20 }}>Connecting to Disboard Engine...</div>;
    }

    const assetUrls = getAssetUrls({ baseUrl: './tldraw-assets' });

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Tldraw store={store} assetUrls={assetUrls} />
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
