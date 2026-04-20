import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs/promises';

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith('--')) {
      parsed._.push(value);
      continue;
    }

    const key = value.slice(2);
    const nextValue = argv[index + 1];

    if (nextValue == null || nextValue.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = nextValue;
    index += 1;
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serial = args.serial ?? 'emulator-5554';
  const command = args._[0] ?? 'step';
  const steps =
    command === 'steps'
      ? Number.parseInt(args._[1] ?? '1', 10)
      : Number.parseInt(args.steps ?? '1', 10);

  if (!serial.startsWith('emulator-')) {
    throw new Error(`Expected an emulator serial, received ${serial}`);
  }

  if (!Number.isFinite(steps) || steps <= 0) {
    throw new Error(`Expected a positive step count, received ${steps}`);
  }

  const port = Number.parseInt(serial.slice('emulator-'.length), 10);
  const authTokenPath = `${os.homedir()}/.emulator_console_auth_token`;
  const authToken = (await fs.readFile(authTokenPath, 'utf8')).trim();

  const consoleClient = new EmulatorConsole({
    authToken,
    host: '127.0.0.1',
    port,
  });

  await consoleClient.connect();

  for (let index = 0; index < steps; index += 1) {
    await consoleClient.send('rotate');
  }

  await consoleClient.close();
  process.stdout.write(
    JSON.stringify({ port, serial, stepsSent: steps }, null, 2) + '\n'
  );
}

class EmulatorConsole {
  constructor({ authToken, host, port }) {
    this.authToken = authToken;
    this.host = host;
    this.port = port;
    this.socket = null;
    this.buffer = '';
  }

  async connect() {
    this.socket = net.createConnection({
      host: this.host,
      port: this.port,
    });

    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk) => {
      this.buffer += chunk;
    });

    await once(this.socket, 'connect');
    await this.waitForReady();
    await this.send(`auth ${this.authToken}`);
  }

  async send(command) {
    this.buffer = '';
    this.socket.write(`${command}\n`);
    return this.waitForReady();
  }

  async waitForReady() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 5000) {
      if (this.buffer.includes('\nOK') || this.buffer.startsWith('OK')) {
        const response = this.buffer;
        this.buffer = '';
        return response;
      }

      if (this.buffer.includes('\nKO') || this.buffer.startsWith('KO')) {
        throw new Error(this.buffer.trim());
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Timed out waiting for emulator console on port ${this.port}`);
  }

  async close() {
    if (!this.socket) {
      return;
    }

    this.socket.end();
    await once(this.socket, 'close');
  }
}

function once(emitter, eventName) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      emitter.off(eventName, onEvent);
      reject(error);
    };

    const onEvent = (...values) => {
      emitter.off('error', onError);
      resolve(values);
    };

    emitter.once(eventName, onEvent);
    emitter.once('error', onError);
  });
}

await main();
