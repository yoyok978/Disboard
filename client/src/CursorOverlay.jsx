import React, { useEffect, useState, useRef } from 'react';

// ── Edge-indicator constants ────────────────────────────────
const EDGE_MARGIN = 20;     // px inset from viewport edge
const MIN_SCALE = 0.60;     // smallest the icon can shrink to (~14px)
const MAX_DISTANCE = 1000;  // px – beyond this distance, icon stays at MIN_SCALE

/**
 * Renders remote users' cursors on top of the tldraw canvas.
 * Cursor positions are stored in PAGE (canvas) space and converted
 * to screen coordinates using editor.pageToScreen() for rendering.
 *
 * When a remote cursor is outside the local viewport the icon is
 * clamped to the nearest edge and scaled down based on distance,
 * so the user always has a visual hint of where other participants are.
 */
export default function CursorOverlay({ awareness, editorRef }) {
    const [cursors, setCursors] = useState([]);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!awareness) return;

        const computeCursors = () => {
            const editor = editorRef?.current;
            const states = awareness.getStates();
            const remoteCursors = [];

            const vw = window.innerWidth;
            const vh = window.innerHeight;

            states.forEach((state, clientId) => {
                if (clientId === awareness.clientID) return;
                if (!state.cursor || !state.user) return;

                let screenX = state.cursor.x;
                let screenY = state.cursor.y;

                if (editor) {
                    try {
                        const screenPoint = editor.pageToScreen({
                            x: state.cursor.x,
                            y: state.cursor.y,
                        });
                        screenX = screenPoint.x;
                        screenY = screenPoint.y;
                    } catch (err) {
                        // Fallback if editor isn't ready yet
                    }
                }

                // ── Off-screen detection & clamping ──────────────
                const isOffScreen =
                    screenX < 0 || screenX > vw ||
                    screenY < 0 || screenY > vh;

                let scale = 1;

                if (isOffScreen) {
                    // Distance from the original point to the nearest edge
                    const dx = screenX < 0 ? -screenX : screenX > vw ? screenX - vw : 0;
                    const dy = screenY < 0 ? -screenY : screenY > vh ? screenY - vh : 0;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    scale = Math.max(MIN_SCALE, 1 - distance / MAX_DISTANCE);

                    // Clamp to viewport with margin
                    screenX = Math.max(EDGE_MARGIN, Math.min(vw - EDGE_MARGIN, screenX));
                    screenY = Math.max(EDGE_MARGIN, Math.min(vh - EDGE_MARGIN, screenY));
                }

                remoteCursors.push({
                    clientId,
                    x: screenX,
                    y: screenY,
                    scale,
                    isOffScreen,
                    name: state.user.name,
                    avatarUrl: state.user.avatarUrl,
                    color: state.user.color || '#5865F2',
                });
            });

            setCursors(remoteCursors);
        };

        // Batched update for awareness changes (network-driven, RAF is fine)
        const scheduleUpdate = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(computeCursors);
        };

        // Re-compute when awareness changes (remote cursor moved)
        awareness.on('change', scheduleUpdate);

        // Listen to tldraw's store for camera changes so cursors reposition
        // synchronously with the canvas — no one-frame lag.
        const editor = editorRef?.current;
        let unlistenStore;
        if (editor) {
            unlistenStore = editor.store.listen(
                (entry) => {
                    for (const [, [, to]] of Object.entries(entry.changes.updated)) {
                        if (to.typeName === 'camera') {
                            computeCursors();   // synchronous – keeps cursors in lockstep
                            return;
                        }
                    }
                },
                { source: 'all', scope: 'document' },
            );
        }

        computeCursors();

        return () => {
            awareness.off('change', scheduleUpdate);
            if (unlistenStore) unlistenStore();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [awareness, editorRef]);

    if (cursors.length === 0) return null;

    return (
        <div className="cursor-overlay">
            {cursors.map((cursor) => (
                <div
                    key={cursor.clientId}
                    className="remote-cursor"
                    style={{
                        transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${cursor.scale})`,
                    }}
                >
                    <div
                        className="cursor-avatar"
                        style={{
                            borderColor: cursor.color,
                            backgroundColor: cursor.avatarUrl ? 'transparent' : cursor.color,
                        }}
                    >
                        {cursor.avatarUrl ? (
                            <img src={cursor.avatarUrl} alt={cursor.name} draggable={false} />
                        ) : (
                            <span className="cursor-avatar-fallback">
                                {cursor.name.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {!cursor.isOffScreen && (
                        <div
                            className="cursor-name"
                            style={{ backgroundColor: cursor.color }}
                        >
                            {cursor.name}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
