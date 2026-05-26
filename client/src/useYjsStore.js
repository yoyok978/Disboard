import { useEffect, useState, useCallback } from 'react'
import { createTLStore, defaultShapeUtils } from 'tldraw'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

/**
 * @param {{ roomId: string, hostUrl: string, user: object }} opts
 * @returns {{ status: string, store?: object, provider?: WebsocketProvider }}
 */
export function useYjsStore({ roomId, hostUrl, user }) {
    const [storeWithStatus, setStoreWithStatus] = useState({ status: 'loading' })

    useEffect(() => {
        setStoreWithStatus({ status: 'loading' })
        const yDoc = new Y.Doc()
        const yMap = yDoc.getMap('tldraw')

        const wsProvider = new WebsocketProvider(hostUrl, roomId, yDoc)
        // Ensure binary transport – avoids blob→arraybuffer conversion on iPad Safari
        if (wsProvider.ws) wsProvider.ws.binaryType = 'arraybuffer'
        wsProvider.on('status', () => {
            if (wsProvider.ws) wsProvider.ws.binaryType = 'arraybuffer'
        })

        // Set local awareness with user info
        if (user) {
            wsProvider.awareness.setLocalStateField('user', {
                name: user.globalName || user.username,
                avatarUrl: user.avatarUrl,
                color: user.color || '#5865F2',
                id: user.id,
            })
        }

        const store = createTLStore({ shapeUtils: defaultShapeUtils })

        let unsubs = []

        wsProvider.on('status', (event) => {
            if (event.status === 'connected') {

                // Initial load from Yjs to Tldraw
                const records = []
                yMap.forEach((val, key) => records.push(val))
                if (records.length > 0) {
                    store.mergeRemoteChanges(() => store.put(records))
                }

                // Tldraw -> Yjs (batched per-frame to reduce WebSocket messages)
                let pendingAdds = {}
                let pendingUpdates = {}
                let pendingRemoves = {}
                let flushRaf = null

                const flushToYjs = () => {
                    flushRaf = null
                    const adds = pendingAdds
                    const updates = pendingUpdates
                    const removes = pendingRemoves
                    pendingAdds = {}
                    pendingUpdates = {}
                    pendingRemoves = {}
                    const hasWork = Object.keys(adds).length || Object.keys(updates).length || Object.keys(removes).length
                    if (!hasWork) return
                    yDoc.transact(() => {
                        for (const record of Object.values(adds)) yMap.set(record.id, record)
                        for (const record of Object.values(updates)) yMap.set(record.id, record)
                        for (const id of Object.keys(removes)) yMap.delete(id)
                    })
                }

                unsubs.push(
                    store.listen((update) => {
                        if (update.source !== 'user') return
                        Object.values(update.changes.added).forEach((r) => { pendingAdds[r.id] = r })
                        Object.values(update.changes.updated).forEach(([_, r]) => { pendingUpdates[r.id] = r })
                        Object.keys(update.changes.removed).forEach((id) => { pendingRemoves[id] = true })
                        if (!flushRaf) flushRaf = requestAnimationFrame(flushToYjs)
                    }, { scope: 'document' })
                )

                // Yjs -> Tldraw
                yMap.observe((event) => {
                    store.mergeRemoteChanges(() => {
                        event.changes.keys.forEach((change, key) => {
                            if (change.action === 'add' || change.action === 'update') {
                                const record = yMap.get(key)
                                if (record) store.put([record])
                            } else if (change.action === 'delete') {
                                store.remove([key])
                            }
                        })
                    })
                })

                setStoreWithStatus({ status: 'synced-remote', store, provider: wsProvider })
            } else if (event.status === 'disconnected') {
                setStoreWithStatus({ status: 'synced-local', store, provider: wsProvider })
            }
        })

        return () => {
            unsubs.forEach((fn) => fn())
            if (flushRaf) { cancelAnimationFrame(flushRaf); flushToYjs() }
            wsProvider.disconnect()
            yDoc.destroy()
        }
    }, [roomId, hostUrl])

    return storeWithStatus
}
