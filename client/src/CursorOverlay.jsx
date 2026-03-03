import React, { useEffect, useState, useRef } from 'react';

/**
 * Renders remote users' cursors on top of the tldraw canvas.
 * Each cursor shows a small arrow + circular Discord profile picture.
 *
 * @param {{ awareness: import('y-protocols/awareness').Awareness, userId: string }} props
 */
export default function CursorOverlay({ awareness, userId }) {
    const [cursors, setCursors] = useState([]);
    const rafRef = useRef(null);
    const pendingUpdate = useRef(false);

    useEffect(() => {
        if (!awareness) return;

        const updateCursors = () => {
            const states = awareness.getStates();
            const remoteCursors = [];

            states.forEach((state, clientId) => {
                // Skip our own cursor
                if (clientId === awareness.clientID) return;
                if (!state.cursor || !state.user) return;

                remoteCursors.push({
                    clientId,
                    x: state.cursor.x,
                    y: state.cursor.y,
                    name: state.user.name,
                    avatarUrl: state.user.avatarUrl,
                    color: state.user.color || '#5865F2',
                });
            });

            setCursors(remoteCursors);
            pendingUpdate.current = false;
        };

        const onAwarenessChange = () => {
            // Throttle updates to animation frames for smooth rendering
            if (!pendingUpdate.current) {
                pendingUpdate.current = true;
                rafRef.current = requestAnimationFrame(updateCursors);
            }
        };

        awareness.on('change', onAwarenessChange);

        // Initial load
        updateCursors();

        return () => {
            awareness.off('change', onAwarenessChange);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [awareness, userId]);

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
                    {/* SVG cursor arrow */}
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

                    {/* Avatar circle */}
                    <div
                        className="cursor-avatar"
                        style={{
                            borderColor: cursor.color,
                            backgroundColor: cursor.avatarUrl ? 'transparent' : cursor.color,
                        }}
                    >
                        {cursor.avatarUrl ? (
                            <img
                                src={cursor.avatarUrl}
                                alt={cursor.name}
                                draggable={false}
                            />
                        ) : (
                            <span className="cursor-avatar-fallback">
                                {cursor.name.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* Name label */}
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
