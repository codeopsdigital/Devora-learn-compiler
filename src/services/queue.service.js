const Bull = require('bull');
const { QUEUE_NAME } = require('../config/constants');
const redis = require('../config/redis');
const logger = require('../utils/logger');

const codeExecutionQueue = new Bull(QUEUE_NAME, {
  redis: {
    port: redis.options.port,
    host: redis.options.host,
    password: redis.options.password,
    db: redis.options.db,
  },
  defaultJobOptions: {
    attempts: 1,
    timeout: 35000,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

codeExecutionQueue.on('error', (err) => {
  logger.error('Bull Queue Error:', err);
});

const addJob = async (jobData) => {
  try {
    const job = await codeExecutionQueue.add(jobData);
    logger.info(`Job ${job.id} added to the queue for language ${jobData.language}`);
    return job.id;
  } catch (error) {
    logger.error('Error adding job to the queue:', error);
    throw error;
  }
};

module.exports = {
  addJob,
  codeExecutionQueue,
};
