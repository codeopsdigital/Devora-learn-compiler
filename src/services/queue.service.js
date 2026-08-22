const Bull = require('bull');
const { QUEUE_NAME } = require('../config/constants');
const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const codeExecutionQueue = new Bull(QUEUE_NAME, REDIS_URL, {
  defaultJobOptions: {
    attempts: 1,
    timeout: 35000,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

codeExecutionQueue.on('error', (err) => {
  if (err.code !== 'EAI_AGAIN') {
    logger.error('Bull Queue Error:', err.message || err);
  }
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
