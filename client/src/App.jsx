import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { setupDiscordSdk } from './discord';
import { useYjsStore } from './useYjsStore';
import CursorOverlay from './CursorOverlay';

import { getAssetUrls } from '@tldraw/assets/selfHosted';

function Whiteboard({ roomId, user }) {
    const containerRef = useRef(null);

    const isLocalDevelopment = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.trycloudflare.com');

    const isDiscord = window.location.hostname.endsWith('.discordsays.com');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const HOST_URL = (isLocalDevelopment || isDiscord)
        ? `${wsProtocol}//${window.location.host}/ws`
        : 'wss://disboard-xb6e.onrender.com';

    const { store, status, provider } = useYjsStore({ roomId, hostUrl: HOST_URL, user });

    // Broadcast cursor position via awareness
    const handleMouseMove = useCallback((e) => {
        if (!provider?.awareness) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        provider.awareness.setLocalStateField('cursor', {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    }, [provider]);

    // Clear cursor when mouse leaves the canvas
    const handleMouseLeave = useCallback(() => {
        if (!provider?.awareness) return;
        provider.awareness.setLocalStateField('cursor', null);
    }, [provider]);

    if (status === 'loading') {
        return <div style={{ color: 'white', padding: 20 }}>Connecting to Disboard Engine...</div>;
    }

    const assetUrls = getAssetUrls({ baseUrl: './tldraw-assets' });

    return (
        <div
            ref={containerRef}
            style={{ position: 'fixed', inset: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <Tldraw store={store} assetUrls={assetUrls} />
            <CursorOverlay
                awareness={provider?.awareness}
                userId={user?.id}
            />
        </div>
    );
}

function App() {
    const [roomId, setRoomId] = useState(null);
    const [user, setUser] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setupDiscordSdk()
            .then(({ roomId: id, user: u }) => {
                setRoomId(id);
                setUser(u);
            })
            .catch((err) => {
                console.error("SDK Setup failed", err);
                setRoomId('test-room');
                setUser({ id: 'fallback', username: 'local', globalName: 'Local User', avatarUrl: null, color: '#5865F2' });
            });
    }, []);

    if (error) {
        return <div style={{ color: 'white', padding: 20 }}>Error: {error.message}</div>;
    }

    if (!roomId) {
        return <div style={{ color: 'white', padding: 20 }}>Initializing Disboard SDK...</div>;
    }

    return <Whiteboard roomId={roomId} user={user} />;
}

export default App;
