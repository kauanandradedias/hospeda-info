// Servidor local simples para testar o site sem depender da CLI da Vercel.
// Uso: node dev-server.js  (depois abra http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const checkDomain = require('./api/check-domain.js');

const PORT = 3000;
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/check-domain') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        // corpo inválido vira objeto vazio; a função responde 400
      }
      const fakeReq = { method: 'POST', body: parsed };
      const fakeRes = {
        status(code) {
          this._code = code;
          return this;
        },
        json(payload) {
          res.writeHead(this._code || 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        },
      };
      await checkDomain(fakeReq, fakeRes);
    });
    return;
  }

  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
