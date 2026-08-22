const socketIo = require('socket.io');
const logger = require('../utils/logger');
const activeJobs = require('./activeJobs');

let io;

const init = (server, clientUrl) => {
  const rawClientUrls = (clientUrl || 'http://localhost:3000').replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  const allowedOrigins = rawClientUrls
    .split(',')
    .map(url => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  io = socketIo(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const cleanedOrigin = origin.replace(/\/$/, '');

        const isAllowed = allowedOrigins.some(allowed => {
          if (allowed === '*') return true;
          if (allowed === cleanedOrigin) return true;
          if (allowed.startsWith('*.')) {
            const domainPattern = allowed.slice(2);
            if (cleanedOrigin.endsWith('.' + domainPattern) || cleanedOrigin.includes(domainPattern)) return true;
          }
          return false;
        }) || 
        cleanedOrigin.includes('devoracamp') || 
        cleanedOrigin.includes('vercel.app') || 
        cleanedOrigin.includes('localhost') || 
        cleanedOrigin.includes('127.0.0.1');

        if (isAllowed) {
          callback(null, true);
        } else {
          logger.warn(`Socket CORS blocked for origin: ${origin}`);
          callback(null, false);
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('join:job', (payload) => {
      const jobId = typeof payload === 'object' && payload?.jobId ? payload.jobId : payload;
      if (jobId) {
        socket.join(`job:${jobId}`);
        logger.info(`Socket ${socket.id} joined room job:${jobId}`);
      }
    });

    socket.on('job:stdin', (payload) => {
      const { jobId, data } = (typeof payload === 'object' && payload !== null) ? payload : {};
      const job = activeJobs.get(jobId);
      if (job) {
        job.writeStdin((data || '') + '\n');
      } else {
        logger.warn(`job:stdin received for unknown or finished job: ${jobId}`);
      }
    });

    socket.on('job:stdin:close', (payload) => {
      const jobId = typeof payload === 'object' && payload?.jobId ? payload.jobId : payload;
      const job = activeJobs.get(jobId);
      if (job) {
        job.closeStdin();
      } else {
        logger.warn(`job:stdin:close received for unknown or finished job: ${jobId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const emitToJob = (jobId, event, data) => {
  if (io) {
    io.to(`job:${jobId}`).emit(event, data);
  } else {
    logger.error('Socket.io not initialized');
  }
};

module.exports = {
  init,
  emitToJob,
};
