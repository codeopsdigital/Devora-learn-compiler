const socketIo = require('socket.io');
const logger = require('../utils/logger');
const activeJobs = require('./activeJobs');

let io;

const init = (server) => {
  io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Detailed logging for engine.io connection handshakes and errors
  io.engine.on('headers', (headers, req) => {
    logger.info(`Engine.IO handshake request: ${req.method} ${req.url} from origin: ${req.headers.origin || 'none'}`);
  });

  io.engine.on('connection_error', (err) => {
    logger.error(`Engine.IO connection error: ${err.code} - ${err.message} (context: ${JSON.stringify(err.context || {})})`);
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected successfully: ${socket.id}`);

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

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (reason: ${reason})`);
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
