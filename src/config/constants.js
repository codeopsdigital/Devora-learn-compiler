module.exports = {
  LANGUAGES: ['cpp', 'python', 'rust', 'go', 'java'],
  TIMEOUTS: {
    cpp: 10000,
    python: 10000,
    go: 10000,
    rust: 15000,
    java: 30000,
  },
  LIMITS: {
    MAX_CODE_SIZE: 65536,
    MAX_STDIN_SIZE: 4096,
    MAX_OUTPUT_SIZE: 100 * 1024, // 100KB
    MAX_JSON_LIMIT: '64kb',
  },
  QUEUE_NAME: 'code-execution',
};
