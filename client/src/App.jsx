import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { setupDiscordSdk } from './discord';
import { useYjsStore } from './useYjsStore';
import CursorOverlay from './CursorOverlay';
import UsersSidebar from './UsersSidebar';

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

    // Use a document-level pointermove listener so we capture movement
    // even when tldraw has pointer capture on its canvas.
    useEffect(() => {
        if (!provider?.awareness) return;
        const container = containerRef.current;
        if (!container) return;

        const onPointerMove = (e) => {
            const rect = container.getBoundingClientRect();
            provider.awareness.setLocalStateField('cursor', {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        };

        const onPointerLeave = () => {
            provider.awareness.setLocalStateField('cursor', null);
        };

        // Capture phase ensures we intercept before tldraw can stop propagation
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerleave', onPointerLeave, true);

        return () => {
            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('pointerleave', onPointerLeave, true);
        };
    }, [provider]);

    if (status === 'loading') {
        return <div style={{ color: 'white', padding: 20 }}>Connecting to Disboard Engine...</div>;
    }

    const assetUrls = getAssetUrls({ baseUrl: './tldraw-assets' });

    return (
        <div ref={containerRef} style={{ position: 'fixed', inset: 0 }}>
            <Tldraw store={store} assetUrls={assetUrls} />
            <CursorOverlay awareness={provider?.awareness} />
            <UsersSidebar awareness={provider?.awareness} currentUser={user} />
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
