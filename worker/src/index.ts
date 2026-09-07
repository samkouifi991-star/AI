import http from 'http';
import { WebSocketServer } from 'ws';
import { loadConfig, type WorkerConfig } from './config';
import { handleCallSession } from './call-session';
import { logger } from '../../lib/logger';

const startedAt = Date.now();
let activeCallCount = 0;

function loadConfigOrExit(): WorkerConfig {
  try {
    return loadConfig();
  } catch (err: any) {
    // Fails fast and loudly on a missing env var rather than starting in
    // a half-configured state and only discovering it on the first real
    // call.
    logger.error('voice_worker_startup_failed', { errorMessage: err.message });
    process.exit(1);
  }
}

function main() {
  const config = loadConfigOrExit();

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          activeCalls: activeCallCount
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  server.on('error', (err: any) => {
    // Without this handler, an unhandled 'error' event on the server
    // (e.g. the port already being in use) becomes an uncaught exception
    // instead of a clearly-labeled log line — distinguish it here.
    logger.error('voice_worker_listen_failed', { port: config.port, errorMessage: err.message });
    process.exit(1);
  });

  // { noServer: true } — this WS server doesn't listen on its own port;
  // it only handles connections the HTTP server's 'upgrade' event hands
  // it below, so Twilio's Media Stream WebSocket and the /health HTTP
  // check share the single port Railway exposes for this service.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/media-stream') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      activeCallCount += 1;
      logger.info('voice_worker_stream_connection_opened', { activeCallCount });

      let closed = false;
      const onEnded = () => {
        if (closed) return;
        closed = true;
        activeCallCount = Math.max(0, activeCallCount - 1);
        logger.info('voice_worker_stream_connection_closed', { activeCallCount });
      };

      handleCallSession(ws, config);
      ws.on('close', onEnded);
      ws.on('error', onEnded);
    });
  });

  server.listen(config.port, () => {
    logger.info('voice_worker_started', { port: config.port });
  });

  // Railway sends SIGTERM before restarting/redeploying a service —
  // closing the HTTP server lets in-flight health checks finish instead
  // of being cut off mid-response, and gives a clean log line marking
  // exactly when a restart happened (useful for correlating with any
  // call that was dropped around the same time).
  function shutdown(signal: string) {
    logger.info('voice_worker_shutting_down', { signal });
    server.close(() => {
      logger.info('voice_worker_stopped', {});
      process.exit(0);
    });
    // Don't hang forever if something's still holding a connection open.
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('voice_worker_uncaught_exception', { errorMessage: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason: any) => {
    logger.error('voice_worker_unhandled_rejection', { errorMessage: reason?.message ?? String(reason) });
  });
}

main();
