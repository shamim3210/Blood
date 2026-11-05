import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import type { Response } from 'express';

export type RealtimeChannel =
  | 'public:donors'
  | 'public:requests'
  | 'public:stock'
  | 'public:announcements'
  | 'public:community'
  | 'public:gratitude'
  | 'public:trips'
  | `user:${string}`
  | `room:${string}`
  | 'admin:ops';

export interface RealtimeBroadcastEvent {
  type: string;
  channel: RealtimeChannel;
  payload?: Record<string, unknown>;
  timestampIso: string;
}

interface ConnectedWsClient {
  id: string;
  socket: Duplex;
  uid: string | null;
  isAdmin: boolean;
  alive: boolean;
}

interface ConnectedSseClient {
  id: string;
  res: Response;
  uid: string | null;
  isAdmin: boolean;
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeWsControlFrame(opcode: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const clipped = payload.subarray(0, 125);
  const header = Buffer.alloc(2);
  header[0] = 0x80 | (opcode & 0x0f);
  header[1] = clipped.length;
  return Buffer.concat([header, clipped]);
}

class BloodSearchRealtimeHub {
  private readonly wsClients = new Map<string, ConnectedWsClient>();
  private readonly sseClients = new Map<string, ConnectedSseClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private canReceive(
    client: { uid: string | null; isAdmin: boolean },
    channel: RealtimeChannel,
    allowedParticipantUids?: string[]
  ): boolean {
    if (channel.startsWith('public:')) return true;
    if (channel === 'admin:ops') return client.isAdmin;
    if (channel.startsWith('user:')) {
      const targetUid = channel.slice(5);
      return Boolean(client.uid && (client.uid === targetUid || client.isAdmin));
    }
    if (channel.startsWith('room:')) {
      if (!client.uid) return false;
      if (allowedParticipantUids && allowedParticipantUids.length > 0) {
        return allowedParticipantUids.includes(client.uid);
      }
      const roomKey = channel.slice(5);
      const parts = roomKey.split('__');
      return parts.includes(client.uid);
    }
    return false;
  }

  public emitEvent(
    type: string,
    channel: RealtimeChannel,
    payload?: Record<string, unknown>,
    allowedParticipantUids?: string[]
  ): void {
    const event: RealtimeBroadcastEvent = {
      type,
      channel,
      payload,
      timestampIso: new Date().toISOString(),
    };
    const serialized = JSON.stringify(event);
    const wsFrame = encodeWsTextFrame(serialized);

    for (const [id, client] of this.wsClients.entries()) {
      if (!this.canReceive(client, channel, allowedParticipantUids)) continue;
      try {
        client.socket.write(wsFrame);
      } catch {
        this.wsClients.delete(id);
      }
    }

    for (const [id, sse] of this.sseClients.entries()) {
      if (!this.canReceive(sse, channel, allowedParticipantUids)) continue;
      try {
        sse.res.write(`event: message\ndata: ${serialized}\n\n`);
      } catch {
        this.sseClients.delete(id);
      }
    }
  }

  public registerSseClient(res: Response, identity: { uid: string | null; isAdmin: boolean }): () => void {
    const id = `sse_${crypto.randomBytes(8).toString('hex')}`;
    this.sseClients.set(id, {
      id,
      res,
      uid: identity.uid,
      isAdmin: identity.isAdmin,
    });

    const hello: RealtimeBroadcastEvent = {
      type: 'connected',
      channel: 'public:donors',
      payload: { authenticated: Boolean(identity.uid) },
      timestampIso: new Date().toISOString(),
    };
    res.write(`event: message\ndata: ${JSON.stringify(hello)}\n\n`);

    return () => {
      this.sseClients.delete(id);
    };
  }

  public attachWebSocketServer(
    server: http.Server,
    authenticateUpgrade: (req: IncomingMessage) => Promise<{ uid: string | null; isAdmin: boolean }>
  ): void {
    server.on('upgrade', async (req: IncomingMessage, socket: Duplex) => {
      try {
        const rawUrl = String(req.url || '');
        const pathname = rawUrl.split('?')[0] || '';
        if (pathname !== '/ws' && pathname !== '/api/v1/ws') {
          return;
        }

        const upgradeHeader = String(req.headers.upgrade || '').toLowerCase();
        const wsKey = String(req.headers['sec-websocket-key'] || '').trim();
        if (upgradeHeader !== 'websocket' || !wsKey) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        const identity = await authenticateUpgrade(req).catch(() => ({ uid: null, isAdmin: false }));

        const acceptKey = crypto
          .createHash('sha1')
          .update(wsKey + WS_GUID)
          .digest('base64');

        socket.write(
          [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${acceptKey}`,
            '\r\n',
          ].join('\r\n')
        );

        const clientId = `ws_${crypto.randomBytes(8).toString('hex')}`;
        const client: ConnectedWsClient = {
          id: clientId,
          socket,
          uid: identity.uid,
          isAdmin: identity.isAdmin,
          alive: true,
        };
        this.wsClients.set(clientId, client);

        const welcome: RealtimeBroadcastEvent = {
          type: 'connected',
          channel: 'public:donors',
          payload: { authenticated: Boolean(identity.uid) },
          timestampIso: new Date().toISOString(),
        };
        socket.write(encodeWsTextFrame(JSON.stringify(welcome)));

        socket.on('data', (chunk: Buffer) => {
          if (chunk.length < 2) return;
          const opcode = chunk[0]! & 0x0f;
          if (opcode === 0x08) {
            // Close frame
            this.wsClients.delete(clientId);
            try {
              socket.write(encodeWsControlFrame(0x08));
              socket.end();
            } catch {}
            return;
          }
          if (opcode === 0x09) {
            // Ping -> Pong
            client.alive = true;
            try {
              socket.write(encodeWsControlFrame(0x0a));
            } catch {}
            return;
          }
          if (opcode === 0x0a) {
            client.alive = true;
          }
        });

        const cleanup = () => {
          this.wsClients.delete(clientId);
        };
        socket.on('close', cleanup);
        socket.on('error', cleanup);
        socket.on('end', cleanup);
      } catch {
        try {
          socket.destroy();
        } catch {}
      }
    });

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        for (const [id, client] of this.wsClients.entries()) {
          if (!client.alive) {
            this.wsClients.delete(id);
            try {
              client.socket.destroy();
            } catch {}
            continue;
          }
          client.alive = false;
          try {
            client.socket.write(encodeWsControlFrame(0x09));
          } catch {
            this.wsClients.delete(id);
          }
        }
      }, 30_000);
      this.heartbeatTimer.unref?.();
    }
  }
}

export const realtimeHub = new BloodSearchRealtimeHub();
