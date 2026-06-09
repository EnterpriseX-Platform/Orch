const http = require('http');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      responseStatus: 'SUCCESS',
      responseCode: '00',
      responseMsg: 'OK',
      flowId: null,
      flowName: null,
      tid: null,
      exception: null,
      responseObjectsMap: null
    }));
  });
});

server.listen(9999, () => {
  console.log('Mock backend running on http://localhost:9999');
});
