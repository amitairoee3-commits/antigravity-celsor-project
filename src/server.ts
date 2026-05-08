/**
 * CELSOR NEXUS — Custom Server
 * Next.js custom server incorporating Socket.io and BullMQ workers.
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { startWorkers } from './lib/queue/workers';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.io
  const io = new SocketIOServer(server, {
    path: '/ws/socket.io',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('[Socket.io] Client connected:', socket.id);
    
    // Join a general signals room
    socket.join('signals_feed');
    
    socket.on('disconnect', () => {
      console.log('[Socket.io] Client disconnected:', socket.id);
    });
  });

  // Attach io to global for API routes to use (hacky but works for custom server)
  (global as any).io = io;

  // Start background workers
  if (!dev || process.env.START_WORKERS === 'true') {
    startWorkers();
  }

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.io ready on path /ws/socket.io`);
  });
});
