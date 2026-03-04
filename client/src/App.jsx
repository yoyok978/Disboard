import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Tldraw } from 'tldraw';
import { InstancePresenceRecordType } from '@tldraw/tlschema';
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
        window.location.hostname === '127.0.0.1';

    const isDiscord = window.location.hostname.endsWith('.discordsays.com');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // If running inside Discord, we MUST use their secure proxy /ws which routes to our Render backend
    // Otherwise we point directly to Render (e.g. when accessing from the raw Vercel URL)
    const HOST_URL = (isLocalDevelopment || isDiscord)
        ? `${wsProtocol}//${window.location.host}/ws`
        : 'wss://disboard-xb6e.onrender.com';

    const { store, status, provider } = useYjsStore({ roomId, hostUrl: HOST_URL, user });

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
        editor.updateInstanceState({ isGridMode: true });
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

    // ── Sync tldraw presence (laser scribbles, brush, selections) via Yjs awareness ──
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || !provider?.awareness) return;

        // Track presence record IDs we've injected into the store for remote users
        const remotePresenceIds = new Map(); // awarenessClientId → presenceRecordId

        // Throttle awareness broadcasts (laser updates ~60fps, awareness needs ~10–20fps)
        let broadcastRaf = null;
        const broadcastPresence = () => {
            if (broadcastRaf) return;
            broadcastRaf = requestAnimationFrame(() => {
                broadcastRaf = null;
                try {
                    const instance = editor.getInstanceState();
                    if (!instance) return;

                    const pageState = editor.getCurrentPageState();
                    const camera = editor.getCamera();
                    const pointer = editor.inputs.currentPagePoint;

                    provider.awareness.setLocalStateField('tldrawPresence', {
                        scribbles: instance.scribbles ?? [],
                        brush: instance.brush ?? null,
                        cursor: {
                            x: pointer?.x ?? 0,
                            y: pointer?.y ?? 0,
                            type: instance.cursor?.type ?? 'default',
                            rotation: instance.cursor?.rotation ?? 0,
                        },
                        selectedShapeIds: pageState?.selectedShapeIds ?? [],
                        currentPageId: editor.getCurrentPageId(),
                        camera: camera ? { x: camera.x, y: camera.y, z: camera.z } : null,
                        screenBounds: instance.screenBounds ?? null,
                        chatMessage: instance.chatMessage ?? '',
                    });
                } catch (e) {
                    // Editor may not be ready
                }
            });
        };

        // Listen to ALL local changes (scribbles are in instance state = session scope)
        const unsubStore = editor.store.listen(broadcastPresence, {
            source: 'user',
            scope: 'all',
        });

        // 2. Receive remote presence from awareness and inject into tldraw store
        const onAwarenessChange = () => {
            const states = provider.awareness.getStates();
            const currentClientId = provider.awareness.clientID;
            const seenClientIds = new Set();

            states.forEach((state, clientId) => {
                if (clientId === currentClientId) return;
                if (!state.tldrawPresence || !state.user) return;

                seenClientIds.add(clientId);
                const p = state.tldrawPresence;

                // Create a stable presence record ID for this remote client
                const presenceId = InstancePresenceRecordType.createId(`remote-${clientId}`);

                try {
                    const presenceRecord = InstancePresenceRecordType.create({
                        id: presenceId,
                        userId: state.user.id || `user-${clientId}`,
                        userName: state.user.name || 'Anonymous',
                        color: state.user.color || '#5865F2',
                        currentPageId: p.currentPageId || editor.getCurrentPageId(),
                        cursor: p.cursor || null,
                        selectedShapeIds: p.selectedShapeIds || [],
                        camera: p.camera || null,
                        screenBounds: p.screenBounds || null,
                        lastActivityTimestamp: Date.now(),
                        chatMessage: p.chatMessage || '',
                        brush: p.brush || null,
                        scribbles: p.scribbles || [],
                        followingUserId: null,
                        meta: {},
                    });

                    editor.store.mergeRemoteChanges(() => {
                        editor.store.put([presenceRecord]);
                    });

                    remotePresenceIds.set(clientId, presenceId);
                } catch (e) {
                    console.warn('[Disboard] Failed to create presence record:', e);
                }
            });

            // Remove presence records for clients that have disconnected
            for (const [clientId, presenceId] of remotePresenceIds) {
                if (!seenClientIds.has(clientId)) {
                    try {
                        editor.store.mergeRemoteChanges(() => {
                            editor.store.remove([presenceId]);
                        });
                    } catch (e) {
                        // Record may already be gone
                    }
                    remotePresenceIds.delete(clientId);
                }
            }
        };

        provider.awareness.on('change', onAwarenessChange);

        return () => {
            unsubStore();
            if (broadcastRaf) cancelAnimationFrame(broadcastRaf);
            provider.awareness.off('change', onAwarenessChange);
            // Clean up all remote presence records
            for (const [, presenceId] of remotePresenceIds) {
                try {
                    editor.store.mergeRemoteChanges(() => {
                        editor.store.remove([presenceId]);
                    });
                } catch (e) { /* ignore */ }
            }
            remotePresenceIds.clear();
        };
    }, [provider, editorRef.current]);

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
