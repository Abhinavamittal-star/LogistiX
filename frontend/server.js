const { createReadStream, existsSync, statSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const distDirectory = path.join(__dirname, 'dist');
const indexPath = path.join(distDirectory, 'index.html');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

if (!existsSync(indexPath)) {
  throw new Error(`Frontend build not found at ${indexPath}. Build the frontend before starting the server.`);
}

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const requestedPath = path.resolve(distDirectory, `.${pathname}`);
  const isInsideDist = requestedPath === distDirectory ||
    requestedPath.startsWith(`${distDirectory}${path.sep}`);
  const hasFile = isInsideDist && existsSync(requestedPath) && statSync(requestedPath).isFile();
  if (!hasFile && (path.extname(pathname) || pathname === '/api' || pathname.startsWith('/api/'))) {
    response.writeHead(404).end('Not found');
    return;
  }
  const filePath = hasFile ? requestedPath : indexPath;

  response.setHeader('Content-Type', contentTypes[path.extname(filePath)] || 'application/octet-stream');
  response.setHeader('Cache-Control', filePath === indexPath ? 'no-cache' : 'public, max-age=31536000, immutable');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  response.writeHead(200);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`LogistiX frontend listening on port ${port}`);
});
