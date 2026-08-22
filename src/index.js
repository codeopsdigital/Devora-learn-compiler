require('dotenv').config();
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const logger = require('./utils/logger');
const connectDB = require('./config/db');
const { globalRateLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const socketService = require('./services/socket.service');
const { processJobs } = require('./services/worker.service');

// Initialize Express  
const app = express(); 
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Clean up stale jobs before starting worker
(async () => {
  const { codeExecutionQueue } = require('./services/queue.service');
  logger.info('Cleaning up stale jobs from previous session...');
  
  // Remove all waiting/delayed jobs
  await codeExecutionQueue.empty();
  
  // Clean up completed and failed jobs
  await codeExecutionQueue.clean(0, 'completed');
  await codeExecutionQueue.clean(0, 'failed');
  await codeExecutionQueue.clean(0, 'delayed');
  await codeExecutionQueue.clean(0, 'wait');
  
  logger.info('Stale jobs cleaned up successfully');
})();

// Initialize Worker Service
processJobs();

// 1. Helmet
app.use(helmet());

// 2. CORS
const rawClientUrls = process.env.CLIENT_URL || 'http://localhost:3000';
const allowedOrigins = rawClientUrls.split(',').map(url => url.trim().replace(/\/$/, ''));

app.use(cors({
  origin: function (origin, callback) {
    const cleanedOrigin = origin ? origin.replace(/\/$/, '') : origin;
    if (!origin || allowedOrigins.includes(cleanedOrigin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
}));

// 3. JSON body parser with limit
app.use(express.json({ limit: '64kb' }));

// 4. Morgan logging
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// 5. Routes (rate limiters applied per-route, not globally)
const executeRoutes = require('./routes/execute.routes');
const jobRoutes = require('./routes/job.routes');

app.use('/api/execute', executeRoutes);
app.use('/api/jobs', jobRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// 7. Global Error Handler
app.use(errorHandler);

// Initialize Socket.io
socketService.init(server, process.env.CLIENT_URL || 'http://localhost:3000');

// Start Server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  logger.info(`Compiler Backend Server running on port ${PORT}`);
});
