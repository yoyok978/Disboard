import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
// Note: We use ES modules to match modern y-websocket dependencies.

const port = process.env.PORT || 1234;

// Simple active documents store
const docs = new Map();

function getDoc(docName) {
    let doc = docs.get(docName);
    if (!doc) {
        doc = new Y.Doc();
        doc.name = docName;
        doc.conns = new Map();
        doc.awareness = new Awareness(doc);

        doc.awareness.setLocalState(null);
        doc.awareness.on("update", ({ added, updated, removed }, conn) => {
            const changedClients = added.concat(updated, removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1);
            encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(doc.awareness, changedClients));
            const buff = encoding.toUint8Array(encoder);
            doc.conns.forEach((_, c) => c.send(buff));
        });

        doc.on("update", (update) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0);
            writeUpdate(encoder, update);
            const buff = encoding.toUint8Array(encoder);
            doc.conns.forEach((_, c) => c.send(buff));
        });

        docs.set(docName, doc);
    }
    return doc;
}

const wss = new WebSocketServer({ port });

wss.on('connection', (conn, req) => {
    const docName = req.url.slice(1).split('?')[0] || 'lobby';
    console.log(`[Disboard] Client connected to room: ${docName}`);
    const doc = getDoc(docName);
    doc.conns.set(conn, new Set());

    // Listen to messages
    conn.on('message', (message) => {
        try {
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const encoder = encoding.createEncoder();
            const msgType = decoding.readVarUint(decoder);
            if (msgType === 0) { // Sync step
                encoding.writeVarUint(encoder, 0);
                readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) {
                    conn.send(encoding.toUint8Array(encoder));
                }
            } else if (msgType === 1) { // Awareness
                applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
            }
        } catch (e) {
            console.error("Error processing message", e);
        }
    });

    // Let the client know about us
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    writeSyncStep1(encoder, doc);
    conn.send(encoding.toUint8Array(encoder));

    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, 1);
        encoding.writeVarUint8Array(awarenessEncoder, encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
        conn.send(encoding.toUint8Array(awarenessEncoder));
    }

    conn.on('close', () => {
        doc.conns.delete(conn);
        if (doc.conns.size === 0) {
            docs.delete(docName);
        }
        console.log(`[Disboard] Client disconnected from room: ${docName}`);
    });
});

console.log(`[Disboard] Native Yjs Sync WebSocket Server listening on ws://localhost:${port}`);
