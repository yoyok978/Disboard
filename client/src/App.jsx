import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Tldraw, ArrowShapeUtil } from 'tldraw';
import { InstancePresenceRecordType } from '@tldraw/tlschema';
import 'tldraw/tldraw.css';
import { setupDiscordSdk, createFallbackUser } from './discord';
import { useYjsStore } from './useYjsStore';
import CursorOverlay from './CursorOverlay';
import UsersSidebar from './UsersSidebar';

import { getAssetUrls } from '@tldraw/assets/selfHosted';

// Disable arrow center-snapping so the arrow starts where you click,
// not at the center of the shape underneath.
const CustomArrowShapeUtil = ArrowShapeUtil.configure({
    arcArrowCenterSnapDistance: 0,
    elbowArrowCenterSnapDistance: 0,
});

function Whiteboard({ roomId, user }) {
    const containerRef = useRef(null);
    const editorRef = useRef(null);
    const [editorReady, setEditorReady] = useState(false);

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

        // ── Right-click pan: manual camera control ──
        const container = editor.getContainer();
        let isPanningWithRightClick = false;
        let lastX = 0;
        let lastY = 0;

        const onPointerDown = (e) => {
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                isPanningWithRightClick = true;
                lastX = e.clientX;
                lastY = e.clientY;
                container.style.cursor = 'grabbing';
            }
        };

        const onPointerMove = (e) => {
            if (isPanningWithRightClick) {
                e.preventDefault();
                e.stopPropagation();

                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;

                const camera = editor.getCamera();
                editor.setCamera({
                    x: camera.x + dx / camera.z,
                    y: camera.y + dy / camera.z,
                    z: camera.z
                });

                lastX = e.clientX;
                lastY = e.clientY;

                // When panning, the screen pointer doesn't change but the page coordinate does.
                // We need to manually update the cursor position for other users.
                if (provider?.awareness) {
                    const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY });
                    provider.awareness.setLocalStateField('cursor', {
                        x: pagePoint.x,
                        y: pagePoint.y,
                    });
                }
            }
        };

        const onPointerUp = (e) => {
            if (e.button === 2 && isPanningWithRightClick) {
                e.preventDefault();
                e.stopPropagation();
                isPanningWithRightClick = false;
                container.style.cursor = '';
            }
        };

        // Suppress native context menu on the canvas
        const onContextMenu = (e) => {
            e.preventDefault();
        };

        // ── Scroll-to-zoom: override default scroll panning ──
        const ZOOM_SPEED = 0.005;
        const MIN_ZOOM = 0.1;
        const MAX_ZOOM = 8;
        const onWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const camera = editor.getCamera();
            const delta = -e.deltaY * ZOOM_SPEED;
            const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.z * (1 + delta)));

            // Zoom toward the cursor position
            const { left, top } = container.getBoundingClientRect();
            const cx = e.clientX - left;
            const cy = e.clientY - top;

            const scaleFactor = newZoom / camera.z;
            editor.setCamera({
                x: cx / newZoom - (cx / camera.z - camera.x),
                y: cy / newZoom - (cy / camera.z - camera.y),
                z: newZoom,
            });
        };

        // Attach down/context menu to container, but move/up to window for smooth dragging outside
        container.addEventListener('pointerdown', onPointerDown, true);
        container.addEventListener('contextmenu', onContextMenu, true);
        container.addEventListener('wheel', onWheel, { passive: false, capture: true });
        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);

        // Tell React the editor is fully populated so dependent components (like CursorOverlay) can re-render
        setEditorReady(true);

        // Cleanup function for when editor unmounts (though handled by strict container lifetime here usually)
        return () => {
            container.removeEventListener('pointerdown', onPointerDown, true);
            container.removeEventListener('contextmenu', onContextMenu, true);
            container.removeEventListener('wheel', onWheel, true);
            window.removeEventListener('pointermove', onPointerMove, true);
            window.removeEventListener('pointerup', onPointerUp, true);
        };
    }, [provider]); // Added provider to dependencies since it's used in onPointerMove

    // Broadcast cursor in tldraw PAGE coordinates so it matches the canvas
    // Throttled to ~30fps to avoid saturating the WebSocket with awareness updates
    useEffect(() => {
        if (!provider?.awareness) return;

        let lastCursorBroadcast = 0;
        let cursorRaf = null;

        const onPointerMove = (e) => {
            const editor = editorRef.current;
            if (!editor) return;

            const now = performance.now();
            if (now - lastCursorBroadcast < 33) return; // ~30fps cap

            if (cursorRaf) cancelAnimationFrame(cursorRaf);
            cursorRaf = requestAnimationFrame(() => {
                cursorRaf = null;
                lastCursorBroadcast = performance.now();
                const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY });
                provider.awareness.setLocalStateField('cursor', {
                    x: pagePoint.x,
                    y: pagePoint.y,
                });
            });
        };

        document.addEventListener('pointermove', onPointerMove, true);

        return () => {
            document.removeEventListener('pointermove', onPointerMove, true);
            if (cursorRaf) cancelAnimationFrame(cursorRaf);
        };
    }, [provider]);

    // ── Sync tldraw presence (laser scribbles, brush, selections) via Yjs awareness ──
    useEffect(() => {
        if (!editorReady) return;
        const editor = editorRef.current;
        if (!editor || !provider?.awareness) return;

        // Track presence record IDs we've injected into the store for remote users
        const remotePresenceIds = new Map(); // awarenessClientId → presenceRecordId
        let isApplyingRemote = false; // prevent feedback loops

        // ── Throttled presence broadcast ──
        // Time-based throttle ensures we don't flood awareness with updates.
        // Laser scribbles update at 60fps internally, but we only need ~20fps over the wire.
        const BROADCAST_INTERVAL = 50; // ms → ~20fps
        let lastBroadcastTime = 0;
        let broadcastTimer = null;

        const doBroadcast = () => {
            broadcastTimer = null;
            lastBroadcastTime = performance.now();
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
        };

        const broadcastPresence = (entry) => {
            // Skip changes that come from injecting remote presence records
            if (isApplyingRemote) return;

            // Quick check: if every changed record is a remote presence record, skip.
            // This prevents the echo loop where receiving awareness → put presence → triggers listen → broadcasts again.
            if (entry) {
                const allUpdated = Object.values(entry.changes.updated);
                const allAdded = Object.values(entry.changes.added);
                const allRemoved = Object.keys(entry.changes.removed);
                const allKeys = [
                    ...allAdded.map(r => r.id),
                    ...allUpdated.map(([, r]) => r.id),
                    ...allRemoved,
                ];
                if (allKeys.length > 0 && allKeys.every(id => typeof id === 'string' && id.includes('remote-'))) {
                    return; // only remote presence changed, don't echo
                }
            }

            const now = performance.now();
            const elapsed = now - lastBroadcastTime;

            if (elapsed >= BROADCAST_INTERVAL) {
                doBroadcast();
            } else if (!broadcastTimer) {
                // Schedule for the remaining time
                broadcastTimer = setTimeout(doBroadcast, BROADCAST_INTERVAL - elapsed);
            }
        };

        // Listen to ALL changes (scribbles come from editor.run(), not user actions)
        const unsubStore = editor.store.listen(broadcastPresence, {
            source: 'all',
            scope: 'all',
        });

        // 2. Receive remote presence from awareness and inject into tldraw store
        //    All puts are batched into a single mergeRemoteChanges call to avoid
        //    N separate store events for N users.
        const onAwarenessChange = () => {
            const states = provider.awareness.getStates();
            const currentClientId = provider.awareness.clientID;
            const seenClientIds = new Set();
            const recordsToPut = [];
            const recordsToRemove = [];

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

                    recordsToPut.push(presenceRecord);
                    remotePresenceIds.set(clientId, presenceId);
                } catch (e) {
                    console.warn('[Disboard] Failed to create presence record:', e);
                }
            });

            // Collect presence records for disconnected clients
            for (const [clientId, presenceId] of remotePresenceIds) {
                if (!seenClientIds.has(clientId)) {
                    recordsToRemove.push(presenceId);
                    remotePresenceIds.delete(clientId);
                }
            }

            // Single batched store update for all remote presence changes
            if (recordsToPut.length > 0 || recordsToRemove.length > 0) {
                isApplyingRemote = true;
                try {
                    editor.store.mergeRemoteChanges(() => {
                        if (recordsToPut.length > 0) editor.store.put(recordsToPut);
                        if (recordsToRemove.length > 0) editor.store.remove(recordsToRemove);
                    });
                } catch (e) {
                    console.warn('[Disboard] Failed to batch update presence:', e);
                } finally {
                    isApplyingRemote = false;
                }
            }
        };

        provider.awareness.on('change', onAwarenessChange);

        return () => {
            unsubStore();
            if (broadcastTimer) clearTimeout(broadcastTimer);
            provider.awareness.off('change', onAwarenessChange);
            // Clean up all remote presence records
            const idsToRemove = Array.from(remotePresenceIds.values());
            if (idsToRemove.length > 0) {
                try {
                    editor.store.mergeRemoteChanges(() => {
                        editor.store.remove(idsToRemove);
                    });
                } catch (e) { /* ignore */ }
            }
            remotePresenceIds.clear();
        };
    }, [provider, editorReady]);

    if (status === 'loading') {
        return <div style={{ color: 'white', padding: 20 }}>Connecting to Disboard Engine...</div>;
    }

    const assetUrls = getAssetUrls({ baseUrl: './tldraw-assets' });

    return (
        <div ref={containerRef} style={{ position: 'fixed', inset: 0 }}>
            <Tldraw store={store} assetUrls={assetUrls} onMount={handleMount} shapeUtils={[CustomArrowShapeUtil]} />
            <CursorOverlay awareness={provider?.awareness} editorRef={editorRef} editorReady={editorReady} />
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