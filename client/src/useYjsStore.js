import { useEffect, useState } from 'react'
import { createTLStore, defaultShapeUtils } from 'tldraw'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export function useYjsStore({ roomId, hostUrl }) {
    const [storeWithStatus, setStoreWithStatus] = useState({ status: 'loading' })

    useEffect(() => {
        setStoreWithStatus({ status: 'loading' })
        const yDoc = new Y.Doc()
        const yMap = yDoc.getMap('tldraw')

        const wsProvider = new WebsocketProvider(hostUrl, roomId, yDoc)

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

                // Tldraw -> Yjs
                unsubs.push(
                    store.listen((update) => {
                        if (update.source !== 'user') return
                        yDoc.transact(() => {
                            Object.values(update.changes.added).forEach((record) => yMap.set(record.id, record))
                            Object.values(update.changes.updated).forEach(([_, record]) => yMap.set(record.id, record))
                            Object.keys(update.changes.removed).forEach((id) => yMap.delete(id))
                        })
                    }, { scope: 'document' }) // only sync the document scope (shapes, assets), leave session and ui out
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

                setStoreWithStatus({ status: 'synced-remote', store })
            } else if (event.status === 'disconnected') {
                setStoreWithStatus({ status: 'synced-local', store }) // Fallback to local
            }
        })

        return () => {
            unsubs.forEach((fn) => fn())
            wsProvider.disconnect()
            yDoc.destroy()
        }
    }, [roomId, hostUrl])

    return storeWithStatus
}
