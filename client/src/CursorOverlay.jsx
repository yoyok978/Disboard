import React, { useEffect, useState, useRef } from 'react';

// ── Edge-indicator constants ────────────────────────────────
const EDGE_MARGIN = 20;
const MIN_SCALE = 0.60;
const MAX_DISTANCE = 1000;

export default function CursorOverlay({ awareness, editorRef, editorReady }) {
    // We only use React state to track WHO is in the room. 
    // We DO NOT use it for x/y coordinates anymore.
    const [activeUsers, setActiveUsers] = useState(new Map());

    // We store direct references to the DOM elements here
    const cursorRefs = useRef(new Map());

    useEffect(() => {
        if (!awareness || !editorReady) return;

        // This function mutates the DOM instantly, bypassing React's render cycle completely.
        const syncCursorPositions = () => {
            const editor = editorRef.current;
            const states = awareness.getStates();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const nextUsers = new Map();
            let rosterChanged = false;

            states.forEach((state, clientId) => {
                if (clientId === awareness.clientID) return;
                if (!state.cursor || !state.user) return;

                nextUsers.set(clientId, state.user);

                // ── Direct DOM Update ──
                const el = cursorRefs.current.get(clientId);
                if (el && editor) {
                    try {
                        const screenPoint = editor.pageToScreen({
                            x: state.cursor.x,
                            y: state.cursor.y,
                        });

                        let screenX = screenPoint.x;
                        let screenY = screenPoint.y;

                        const isOffScreen = screenX < 0 || screenX > vw || screenY < 0 || screenY > vh;
                        let scale = 1;

                        if (isOffScreen) {
                            const dx = screenX < 0 ? -screenX : screenX > vw ? screenX - vw : 0;
                            const dy = screenY < 0 ? -screenY : screenY > vh ? screenY - vh : 0;
                            const distance = Math.sqrt(dx * dx + dy * dy);

                            scale = Math.max(MIN_SCALE, 1 - distance / MAX_DISTANCE);
                            screenX = Math.max(EDGE_MARGIN, Math.min(vw - EDGE_MARGIN, screenX));
                            screenY = Math.max(EDGE_MARGIN, Math.min(vh - EDGE_MARGIN, screenY));
                        }

                        // translate3d forces GPU hardware acceleration for zero-lag rendering
                        el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) scale(${scale})`;

                        // Dynamically hide/show the name badge without triggering React
                        const nameEl = el.querySelector('.cursor-name');
                        if (nameEl) {
                            nameEl.style.display = isOffScreen ? 'none' : 'block';
                        }
                    } catch (err) {
                        // Ignore errors if points calculate poorly before editor mounts
                    }
                }
            });

            // Only trigger a React re-render if someone actually joined or left the room
            setActiveUsers((prev) => {
                if (prev.size !== nextUsers.size) rosterChanged = true;
                else {
                    for (let [id] of nextUsers) {
                        if (!prev.has(id)) rosterChanged = true;
                    }
                }
                return rosterChanged ? nextUsers : prev;
            });
        };

        let rafId = null;
        const onAwarenessChange = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(syncCursorPositions);
        };

        awareness.on('change', onAwarenessChange);

        const editor = editorRef.current;
        const unlistenStore = editor.store.listen(
            (entry) => {
                for (const [, [, to]] of Object.entries(entry.changes.updated)) {
                    if (to.typeName === 'camera') {
                        // Force a SYNCHRONOUS update when the camera pans.
                        // Do NOT use requestAnimationFrame here.
                        syncCursorPositions();
                        return;
                    }
                }
            },
            { source: 'all' },
        );

        syncCursorPositions();

        return () => {
            awareness.off('change', onAwarenessChange);
            if (unlistenStore) unlistenStore();
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [awareness, editorRef, editorReady]);

    if (activeUsers.size === 0) return null;

    return (
        <div
            className="cursor-overlay"
            style={{ pointerEvents: 'none', position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 999 }}
        >
            {Array.from(activeUsers.entries()).map(([clientId, user]) => (
                <div
                    key={clientId}
                    className="remote-cursor"
                    ref={(el) => {
                        if (el) cursorRefs.current.set(clientId, el);
                        else cursorRefs.current.delete(clientId);
                    }}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        willChange: 'transform' // Hints the browser to optimize this element
                    }}
                >
                    <div
                        className="cursor-avatar"
                        style={{
                            borderColor: user.color || '#5865F2',
                            backgroundColor: user.avatarUrl ? 'transparent' : (user.color || '#5865F2'),
                        }}
                    >
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.name} draggable={false} />
                        ) : (
                            <span className="cursor-avatar-fallback">
                                {(user.name || 'A').charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>

                    <div
                        className="cursor-name"
                        style={{ backgroundColor: user.color || '#5865F2' }}
                    >
                        {user.name}
                    </div>
                </div>
            ))}
        </div>
    );
}