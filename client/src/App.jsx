import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { setupDiscordSdk, createFallbackUser } from './discord';
import { useYjsStore } from './useYjsStore';
import CursorOverlay from './CursorOverlay';
import UsersSidebar from './UsersSidebar';

import { getAssetUrls } from '@tldraw/assets/selfHosted';

function Whiteboard({ roomId, user }) {
    const containerRef = useRef(null);
    const editorRef = useRef(null);

    const isLocalDevelopment = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.trycloudflare.com');

    // When deployed to Vercel, the app is served statically, so Vite's proxy doesn't exist.
    // Therefore, any production or Discord environment needs to point to the Render backend directly.
    const HOST_URL = isLocalDevelopment
        ? `${wsProtocol}//${window.location.host}/ws`
        : 'wss://disboard-xb6e.onrender.com';

    const { store, status, provider } = useYjsStore({ roomId, hostUrl: HOST_URL, user });

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
    }, []);

    // Broadcast cursor in tldraw PAGE coordinates so it matches the canvas
    useEffect(() => {
        if (!provider?.awareness) return;

        const onPointerMove = (e) => {
            const editor = editorRef.current;
            if (!editor) return;

            // Use tldraw's screenToPage to convert viewport pixels → canvas coords
            const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY });
            provider.awareness.setLocalStateField('cursor', {
                x: pagePoint.x,
                y: pagePoint.y,
            });
        };

        document.addEventListener('pointermove', onPointerMove, true);

        return () => {
            document.removeEventListener('pointermove', onPointerMove, true);
        };
    }, [provider]);

    if (status === 'loading') {
        return <div style={{ color: 'white', padding: 20 }}>Connecting to Disboard Engine...</div>;
    }

    const assetUrls = getAssetUrls({ baseUrl: './tldraw-assets' });

    return (
        <div ref={containerRef} style={{ position: 'fixed', inset: 0 }}>
            <Tldraw store={store} assetUrls={assetUrls} onMount={handleMount} />
            <CursorOverlay awareness={provider?.awareness} editorRef={editorRef} />
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
                setUser(createFallbackUser());
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
