const http = require('http');

let state = { shapes: [], wires: [], dwgName: 'Untitled', ts: null };
const sseClients = new Set();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function broadcast(exclude) {
  const msg = 'data: ' + JSON.stringify(state) + '\n\n';
  sseClients.forEach(c => {
    if (c !== exclude) {
      try { c.write(msg); } catch(e) { sseClients.delete(c); }
    }
  });
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SSG Sync Server OK | clients: ' + sseClients.size);
    return;
  }

  // GET current state (for Claude to read)
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: sseClients.size, state }));
    return;
  }

  // SSE stream — drawing tool subscribes here
  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'  // disable nginx buffering
    });
    res.write('data: ' + JSON.stringify(state) + '\n\n'); // send current state immediately
    sseClients.add(res);
    console.log('SSE client connected. Total:', sseClients.size);

    // Keep-alive ping every 20s
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch(e) { clearInterval(ping); sseClients.delete(res); }
    }, 20000);

    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(res);
      console.log('SSE client left. Total:', sseClients.size);
    });
    return;
  }

  // POST state — drawing tool pushes here
  if (req.method === 'POST' && req.url === '/state') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        state = { ...JSON.parse(body), ts: new Date().toISOString() };
        broadcast(null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: sseClients.size, ts: state.ts }));
        console.log('State updated:', state.shapes?.length, 'shapes,', state.wires?.length, 'wires');
      } catch(e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

const PORT = process.env.PORT || 8765;
server.listen(PORT, '0.0.0.0', () => console.log('SSG Sync Server on port', PORT));
