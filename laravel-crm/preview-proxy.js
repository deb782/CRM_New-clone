// Preview proxy: exposes the Laravel CRM (localhost:8000) on port 3000 so the
// Emergent preview URL serves the app. API calls use the /crm-api prefix (the
// platform reserves /api for port 8001); we rewrite /crm-api -> /api here.
const http = require('http');

const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 8000;
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let path = req.url;
  if (path.startsWith('/crm-api/')) path = path.replace('/crm-api/', '/api/');
  else if (path === '/crm-api') path = '/api';

  const options = {
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path,
    headers: Object.assign({}, req.headers, { host: TARGET_HOST + ':' + TARGET_PORT }),
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('CRM backend unavailable: ' + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Preview proxy on :' + PORT + ' -> Laravel :' + TARGET_PORT);
});
