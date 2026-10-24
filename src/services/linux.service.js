const { spawn } = require('child_process');
const path = require('path');
const Docker = require('dockerode');
const logger = require('../utils/logger');

// Interactive Linux terminal for the tutorials. One socket == one throwaway
// container, removed as soon as the socket disconnects.
//
// Client -> server: linux:start {cols,rows} | linux:input string | linux:resize {cols,rows}
// Server -> client: linux:ready | linux:output Buffer | linux:exit | linux:error {message}

const IMAGE = 'compiler-linux';
const DOCKERFILE_DIR = path.resolve(__dirname, '..', '..', 'docker', 'linux');
const LABEL = 'devora.linux-sandbox';
const MAX_SESSIONS = Number(process.env.LINUX_MAX_SESSIONS || 20);
const MAX_SESSIONS_PER_IP = Number(process.env.LINUX_MAX_SESSIONS_PER_IP || 3);
const IDLE_TIMEOUT_MS = Number(process.env.LINUX_IDLE_TIMEOUT_MS || 10 * 60 * 1000);
const MAX_LIFETIME_MS = Number(process.env.LINUX_MAX_LIFETIME_MS || 60 * 60 * 1000);

const docker = new Docker(); // local socket, or DOCKER_HOST
const sessions = new Set();
const perIp = new Map();
let imageReady = null;

const ensureImage = () => {
  if (!imageReady) {
    imageReady = docker.getImage(IMAGE).inspect().catch(() => new Promise((resolve, reject) => {
      logger.info(`Building Docker image ${IMAGE}`);
      const build = spawn('docker', ['build', '-t', IMAGE, DOCKERFILE_DIR]);
      let stderr = '';
      build.stderr.on('data', (d) => { stderr += d.toString(); });
      build.on('error', reject);
      build.on('close', (code) => (code === 0
        ? resolve()
        : reject(new Error(`Failed to build ${IMAGE}: ${stderr.trim() || `exit code ${code}`}`))));
    })).catch((err) => { imageReady = null; throw err; });
  }
  return imageReady;
};

const clientIp = (socket) => (
  socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.handshake.address || '?'
).trim();

const register = (socket) => {
  let started = false;
  let closed = false;
  let container = null;
  let stream = null;
  let idleTimer = null;
  let lifeTimer = null;
  const ip = clientIp(socket);

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimer);
    clearTimeout(lifeTimer);
    if (started) {
      sessions.delete(socket.id);
      const left = (perIp.get(ip) || 1) - 1;
      if (left <= 0) perIp.delete(ip); else perIp.set(ip, left);
    }
    if (container) await container.remove({ force: true }).catch(() => {});
  };

  const end = () => {
    socket.emit('linux:exit');
    cleanup();
  };

  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(end, IDLE_TIMEOUT_MS);
  };

  socket.on('linux:start', async (size) => {
    if (started) return;
    if (sessions.size >= MAX_SESSIONS || (perIp.get(ip) || 0) >= MAX_SESSIONS_PER_IP) {
      socket.emit('linux:error', { message: 'The Linux servers are busy. Please try again in a minute.' });
      return;
    }
    started = true;
    sessions.add(socket.id);
    perIp.set(ip, (perIp.get(ip) || 0) + 1);

    try {
      await ensureImage();
      if (closed) return;

      container = await docker.createContainer({
        Image: IMAGE,
        Labels: { [LABEL]: '1' },
        Tty: true,
        OpenStdin: true,
        NetworkDisabled: true,
        HostConfig: {
          AutoRemove: true,
          NetworkMode: 'none',
          Memory: 256 * 1024 * 1024,
          MemorySwap: 256 * 1024 * 1024,
          NanoCpus: 500_000_000,
          PidsLimit: 128,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          ReadonlyRootfs: true,
          Tmpfs: {
            '/home/student': 'rw,exec,nosuid,size=64m,uid=1000,gid=1000',
            '/tmp': 'rw,exec,nosuid,size=32m',
          },
          Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }],
        },
      });
      if (closed) return cleanup();

      await container.start();
      stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true, hijack: true });
      if (closed) return;

      stream.on('data', (chunk) => socket.emit('linux:output', chunk));
      stream.on('end', end);

      const w = Math.min(Math.max(Number(size?.cols) | 0, 10), 500);
      const h = Math.min(Math.max(Number(size?.rows) | 0, 2), 200);
      container.resize({ w, h }).catch(() => {});

      touch();
      lifeTimer = setTimeout(end, MAX_LIFETIME_MS);
      socket.emit('linux:ready');
    } catch (err) {
      logger.error(`Linux session failed to start: ${err.message}`);
      socket.emit('linux:error', { message: 'Could not start the Linux environment.' });
      cleanup();
    }
  });

  socket.on('linux:input', (data) => {
    if (!stream || typeof data !== 'string' || data.length > 16384) return;
    touch();
    stream.write(data);
  });

  socket.on('linux:resize', (size) => {
    if (!container) return;
    const w = Math.min(Math.max(Number(size?.cols) | 0, 10), 500);
    const h = Math.min(Math.max(Number(size?.rows) | 0, 2), 200);
    container.resize({ w, h }).catch(() => {});
  });

  socket.on('disconnect', cleanup);
};

// A crashed backend must not leave sandboxes behind.
const sweep = async () => {
  const stale = await docker.listContainers({ all: true, filters: { label: [LABEL] } }).catch(() => []);
  await Promise.all(stale.map((c) => docker.getContainer(c.Id).remove({ force: true }).catch(() => {})));
};

module.exports = { register, sweep };
