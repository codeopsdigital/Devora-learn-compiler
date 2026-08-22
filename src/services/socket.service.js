const socketIo = require('socket.io');
const logger = require('../utils/logger');
const activeJobs = require('./activeJobs');

let io;

const init = (server, clientUrl) => {
  const allowedOrigins = (clientUrl || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim().replace(/\/$/, ''));

  io = socketIo(server, {
    cors: {
      origin: (origin, callback) => {
        const cleanedOrigin = origin ? origin.replace(/\/$/, '') : origin;
        if (!origin || allowedOrigins.includes(cleanedOrigin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error(`Socket CORS blocked for origin: ${origin}`));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('join:job', (jobId) => {
      socket.join(`job:${jobId}`);
      logger.info(`Socket ${socket.id} joined room job:${jobId}`);
    });

    socket.on('job:stdin', ({ jobId, data }) => {
      const job = activeJobs.get(jobId);
      if (job) {
        job.writeStdin(data + '\n');
      } else {
        logger.warn(`job:stdin received for unknown or finished job: ${jobId}`);
      }
    });

    socket.on('job:stdin:close', ({ jobId }) => {
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
