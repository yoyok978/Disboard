import React, { useEffect, useState } from 'react';

/**
 * A small sidebar that shows all connected users (including yourself).
 * Each entry shows the user's avatar and name.
 */
export default function UsersSidebar({ awareness, currentUser }) {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        if (!awareness) return;

        const updateUsers = () => {
            const states = awareness.getStates();
            const connectedUsers = [];

            states.forEach((state, clientId) => {
                if (!state.user) return;
                connectedUsers.push({
                    clientId,
                    name: state.user.name,
                    avatarUrl: state.user.avatarUrl,
                    color: state.user.color || '#5865F2',
                    isYou: clientId === awareness.clientID,
                });
            });

            // Sort: "you" first, then alphabetical
            connectedUsers.sort((a, b) => {
                if (a.isYou) return -1;
                if (b.isYou) return 1;
                return a.name.localeCompare(b.name);
            });

            setUsers(connectedUsers);
        };

        awareness.on('change', updateUsers);
        updateUsers();

        return () => awareness.off('change', updateUsers);
    }, [awareness]);

    return (
        <div className="users-sidebar">
            <div className="users-sidebar-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>{users.length}</span>
            </div>
            <div className="users-sidebar-list">
                {users.map((user) => (
                    <div
                        key={user.clientId}
                        className={`users-sidebar-item ${user.isYou ? 'is-you' : ''}`}
                        title={user.isYou ? `${user.name} (You)` : user.name}
                    >
                        <div
                            className="users-sidebar-avatar"
                            style={{
                                borderColor: user.color,
                                backgroundColor: user.avatarUrl ? 'transparent' : user.color,
                            }}
                        >
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.name} draggable={false} />
                            ) : (
                                <span>{user.name.charAt(0).toUpperCase()}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
