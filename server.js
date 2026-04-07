const http = require('http');
const crypto = require('crypto');

let state = { shapes: [], wires: [], dwgName: 'Untitled', ts: null };
const clients = new Set();

// ── Pure Node.js WebSocket (no dependencies) ──
function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
}

function wsSend(socket, data) {
  const buf = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const len = buf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  try { socket.write(Buffer.concat([header, buf])); } catch(e) {}
}

function wsParse(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = buf.readUInt32BE(6); offset = 10; }
  if (buf.length < offset + (masked ? 4 : 0) + len) return null;
  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + 4 + i] ^ mask[i % 4];
  } else {
    payload = buf.slice(offset, offset + len);
  }
  return { opcode, payload: payload.toString() };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SSG Sync Server OK | clients: ' + clients.size);
    return;
  }

  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size, state }));
    return;
  }

  if (req.method === 'POST' && req.url === '/state') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        state = { ...JSON.parse(body), ts: new Date().toISOString() };
        const msg = JSON.stringify({ type: 'state', payload: state });
        clients.forEach(s => wsSend(s, msg));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: clients.size }));
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] !== 'websocket') { socket.destroy(); return; }
  wsHandshake(req, socket);
  clients.add(socket);
  wsSend(socket, JSON.stringify({ type: 'state', payload: state }));
  console.log('WS client connected. Total:', clients.size);

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    const frame = wsParse(buf);
    if (!frame) return;
    buf = Buffer.alloc(0);
    if (frame.opcode === 8) { socket.destroy(); return; }
    if (frame.opcode === 1) {
      try {
        const msg = JSON.parse(frame.payload);
        if (msg.type === 'state') {
          state = { ...msg.payload, ts: new Date().toISOString() };
          const out = JSON.stringify({ type: 'state', payload: state });
          clients.forEach(s => { if (s !== socket) wsSend(s, out); });
        }
      } catch(e) {}
    }
  });

  socket.on('close', () => { clients.delete(socket); console.log('WS client left. Total:', clients.size); });
  socket.on('error', () => clients.delete(socket));
});

const PORT = process.env.PORT || 8765;
server.listen(PORT, () => console.log('SSG Sync Server running on port', PORT));
