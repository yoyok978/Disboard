import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import 'dotenv/config';

const port = process.env.PORT || 1234;

// ─── Express HTTP Server ─────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// OAuth2 token exchange endpoint
app.post('/api/token', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    try {
        const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('[Disboard] Token exchange failed:', data);
            return res.status(response.status).json(data);
        }
        res.json({ access_token: data.access_token });
    } catch (err) {
        console.error('[Disboard] Token exchange error:', err);
        res.status(500).json({ error: 'Token exchange failed' });
    }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = createServer(app);

// ─── Yjs WebSocket Server ────────────────────────────────────
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

const wss = new WebSocketServer({ server });

wss.on('connection', (conn, req) => {
    const docName = req.url.slice(1).split('?')[0] || 'lobby';
    console.log(`[Disboard] Client connected to room: ${docName}`);
    const doc = getDoc(docName);
    doc.conns.set(conn, new Set());

    conn.on('message', (message) => {
        try {
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const encoder = encoding.createEncoder();
            const msgType = decoding.readVarUint(decoder);
            if (msgType === 0) {
                encoding.writeVarUint(encoder, 0);
                readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) {
                    conn.send(encoding.toUint8Array(encoder));
                }
            } else if (msgType === 1) {
                applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
            }
        } catch (e) {
            console.error("Error processing message", e);
        }
    });

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    writeSyncStep1(encoder, doc);
    conn.send(encoding.toUint8Array(encoder));

    // Send current awareness states
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

server.listen(port, () => {
    console.log(`[Disboard] Server listening on http://localhost:${port} (HTTP + WebSocket)`);
});
