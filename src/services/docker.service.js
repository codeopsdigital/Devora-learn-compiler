const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { TIMEOUTS, LIMITS } = require('../config/constants');

const BASE_JOBS_DIR = process.env.JOBS_DIR || '/tmp/jobs';
const IMAGE_PREFIX = 'compiler-';
const imageBuildPromises = new Map();

const getImageConfig = (language) => ({
  imageName: `${IMAGE_PREFIX}${language}`,
  dockerfileDir: path.resolve(__dirname, '..', '..', 'docker', language),
});

const buildDockerImage = async (language) => {
  const { imageName, dockerfileDir } = getImageConfig(language);

  logger.info(`Building Docker image for ${language}: ${imageName}`);

  await new Promise((resolve, reject) => {
    const buildProcess = spawn('docker', [
      'build',
      '-t', imageName,
      dockerfileDir,
    ]);

    let stderr = '';

    buildProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    buildProcess.on('error', reject);

    buildProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Failed to build Docker image ${imageName}: ${stderr.trim() || `exit code ${code}`}`));
    });
  });
};

const ensureDockerImage = async (language) => {
  const { imageName } = getImageConfig(language);

  try {
    await new Promise((resolve, reject) => {
      const inspectProcess = spawn('docker', ['image', 'inspect', imageName]);

      inspectProcess.on('error', reject);
      inspectProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Image ${imageName} not found`));
      });
    });
  } catch (error) {
    if (!imageBuildPromises.has(language)) {
      imageBuildPromises.set(language, buildDockerImage(language).finally(() => {
        imageBuildPromises.delete(language);
      }));
    }

    await imageBuildPromises.get(language);
  }
};

// onSpawn(handles) is called synchronously after the Docker process starts,
// with { writeStdin, closeStdin } — before execution completes.
const runCode = async (language, code, stdin, onStdout, onStderr, onSpawn, timeoutOverride) => {
  const jobId = uuidv4();
  const jobDir = path.resolve(BASE_JOBS_DIR, jobId);
  
  // File names based on language
  const fileNames = {
    cpp: 'main.cpp',
    python: 'main.py',
    rust: 'main.rs',
    go: 'main.go',
    java: 'Main.java',
  };

  const fileName = fileNames[language];
  const codePath = path.join(jobDir, fileName);
  let stdoutSize = 0;
  let stderrSize = 0;

  try {
    // 1. Create temp dir
    await fs.mkdir(jobDir, { recursive: true });

    // 2. Write code
    await fs.writeFile(codePath, code);

    const startTime = Date.now();
    const timeout = timeoutOverride ?? TIMEOUTS[language] ?? 10000;

    await ensureDockerImage(language);

    // 4. Docker command
    const args = [
      'run', '--rm', '-i',
      '--network', 'none',
      '--cpus', '1.0',
      '--memory', '256m',
      '--memory-swap', '256m',
      '--pids-limit', '50',
      '--read-only',
      '--tmpfs', '/tmp:rw,exec,size=64m',
      '--security-opt', 'no-new-privileges',
      '-u', '1000:1000',
      '-v', `${jobDir}:/code:ro`,
      `compiler-${language}`,
      '/bin/sh', '/run.sh'
    ];

    logger.info(`Starting execution for job: ${jobId}, language: ${language}`);

    const dockerProcess = spawn('docker', args);

    // Pipe any pre-provided stdin immediately, then leave the pipe open for
    // additional writes via writeStdin() until the caller calls closeStdin().
    if (stdin) {
      dockerProcess.stdin.write(stdin);
    }

    const writeStdin = (data) => {
      if (!dockerProcess.stdin.destroyed) {
        dockerProcess.stdin.write(data);
      }
    };

    const closeStdin = () => {
      if (!dockerProcess.stdin.destroyed) {
        dockerProcess.stdin.end();
      }
    };

    if (onSpawn) onSpawn({ writeStdin, closeStdin });

    // Output buffering and streaming
    dockerProcess.stdout.on('data', (data) => {
      if (stdoutSize < LIMITS.MAX_OUTPUT_SIZE) {
        const remaining = LIMITS.MAX_OUTPUT_SIZE - stdoutSize;
        const chunk = data.slice(0, remaining);
        onStdout(chunk);
        stdoutSize += chunk.length;
      }
    });

    dockerProcess.stderr.on('data', (data) => {
      if (stderrSize < LIMITS.MAX_OUTPUT_SIZE) {
        const remaining = LIMITS.MAX_OUTPUT_SIZE - stderrSize;
        const chunk = data.slice(0, remaining);
        onStderr(chunk);
        stderrSize += chunk.length;
      }
    });

    // 5. Hard kill after timeout
    const timeoutHandle = setTimeout(() => {
      logger.warn(`Job ${jobId} timed out after ${timeout}ms. Killing container...`);
      dockerProcess.kill('SIGKILL');
      // Additional docker kill if necessary (container name tracking would be better)
      // Since --rm is used, killing the process should ideally clean up.
      // Better to use --name and 'docker kill' for absolute safety, but we'll stick to spawn pid for now.
    }, timeout);

    const result = await new Promise((resolve) => {
      dockerProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        resolve({ exitCode: code, duration });
      });

      dockerProcess.on('error', (err) => {
        logger.error(`Docker process error for job ${jobId}:`, err);
        clearTimeout(timeoutHandle);
        resolve({ exitCode: -1, duration: 0, error: err.message });
      });
    });

    return { ...result, writeStdin, closeStdin };

  } catch (error) {
    logger.error(`Error in runCode Service for job ${jobId}:`, error);
    throw error;
  } finally {
    // 6. Cleanup temp dir
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
      logger.info(`Cleaned up job directory: ${jobDir}`);
    } catch (cleanupError) {
      logger.error(`Failed to cleanup job directory ${jobDir}:`, cleanupError);
    }
  }
};

module.exports = {
  runCode,
};
