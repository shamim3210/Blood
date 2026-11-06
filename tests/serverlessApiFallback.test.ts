import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../api/index';

test('serverless configuration failures return an explicit service error, not empty donor results', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    auditIpSalt: process.env.AUDIT_IP_SALT,
  };
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  delete process.env.AUDIT_IP_SALT;

  const server = http.createServer((req, res) => {
    void handler(req, res);
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/donors/search`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'SERVICE_UNAVAILABLE');
    assert.deepEqual(payload.items, []);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous.vercelEnv;
    if (previous.auditIpSalt === undefined) delete process.env.AUDIT_IP_SALT;
    else process.env.AUDIT_IP_SALT = previous.auditIpSalt;
  }
});
