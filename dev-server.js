// Servidor local para testar o site sem depender da CLI da Vercel.
// Uso: node dev-server.js  (depois abra http://localhost:3000)
//
// Roteia qualquer /api/<nome> para ./api/<nome>.js, imitando o formato de função
// serverless da Vercel (req.body já parseado, res.status().json()).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function decorateRes(res) {
  res.status = function status(code) {
    this._code = code;
    return this;
  };
  res.json = function json(payload) {
    this.writeHead(this._code || 200, { 'Content-Type': 'application/json; charset=utf-8' });
    this.end(JSON.stringify(payload));
  };
  return res;
}

async function handleApi(req, res, routeName) {
  const handlerPath = path.join(__dirname, 'api', `${routeName}.js`);

  if (!routeName || !/^[a-z0-9-]+$/i.test(routeName) || !fs.existsSync(handlerPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rota_nao_encontrada' }));
    return;
  }

  const raw = await readBody(req);
  req.rawBody = raw;

  if (raw) {
    try {
      req.body = JSON.parse(raw);
    } catch {
      req.body = {};
    }
  } else {
    req.body = {};
  }

  // require sem cache: editar um handler não exige reiniciar o servidor.
  delete require.cache[require.resolve(handlerPath)];
  const handler = require(handlerPath);

  try {
    await handler(req, decorateRes(res));
  } catch (err) {
    console.error(`[dev-server] erro em /api/${routeName}:`, err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'erro_interno' }));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url.pathname.slice('/api/'.length));
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const filePath = path.join(__dirname, relative);

  // Impede subir de diretório com ../ e servir arquivos fora do projeto.
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[path.extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
