import React, { useEffect, useState, useRef } from 'react';

/**
 * Renders remote users' cursors on top of the tldraw canvas.
 * Cursor positions are stored in PAGE (canvas) space and converted
 * to screen coordinates using editor.pageToScreen() for rendering.
 * Also re-renders when the local camera moves so cursors stay in place.
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

                remoteCursors.push({
                    clientId,
                    x: screenX,
                    y: screenY,
                    name: state.user.name,
                    avatarUrl: state.user.avatarUrl,
                    color: state.user.color || '#5865F2',
                });
            });

            setCursors(remoteCursors);
        };

        const scheduleUpdate = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(computeCursors);
        };

        // Re-compute when awareness changes (remote cursor moved)
        awareness.on('change', scheduleUpdate);

        // Also re-compute on local camera changes (pan/zoom) so remote cursors
        // reposition on screen even when they aren't moving
        const onPointerMove = () => scheduleUpdate();
        const onWheel = () => scheduleUpdate();
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('wheel', onWheel, true);

        computeCursors();

        return () => {
            awareness.off('change', scheduleUpdate);
            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('wheel', onWheel, true);
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
                        transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                    }}
                >
                    <svg
                        className="cursor-arrow"
                        width="16"
                        height="20"
                        viewBox="0 0 16 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M1 1L1 17.5L5.5 13L10.5 19L13.5 17L8.5 11L14.5 10L1 1Z"
                            fill={cursor.color}
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                        />
                    </svg>

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

                    <div
                        className="cursor-name"
                        style={{ backgroundColor: cursor.color }}
                    >
                        {cursor.name}
                    </div>
                </div>
            ))}
        </div>
    );
}
