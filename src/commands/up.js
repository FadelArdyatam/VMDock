import { exec as execAsyncCallback, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { ensureVmReady } from '../core/vm-manager.js';
import { setupPortProxy } from '../core/proxy.js';
import { warnIfNotAdmin, isAdmin } from '../utils/check-env.js';

const exec = promisify(execAsyncCallback);

/**
 * Runs a command and streams its output to the terminal
 */
function runInteractive(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit', shell: true });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

export default async function upCommand() {
  warnIfNotAdmin();
  const { config, ip } = await ensureVmReady();

  const dockerHost = `tcp://${ip}:${config.vm.docker_port}`;
  process.env.DOCKER_HOST = dockerHost;

  console.log(chalk.cyan(`\nStarting VMDock services via ${dockerHost}...\n`));

  const services = config.services || {};
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    console.log(chalk.yellow('No services defined in vmdock.yml.'));
    return;
  }

  let runningCount = 0;
  const exposedPorts = [];

  for (const name of serviceNames) {
    const service = services[name];
    const startTime = Date.now();

    console.log(chalk.white.bold(`[${name}]`));

    try {
      // 1. Check if container is already running
      let isRunning = '';
      try {
        const { stdout } = await exec(`docker ps -q -f name=^vmdock-${name}$`);
        isRunning = stdout.trim();
      } catch (e) { }

      if (isRunning) {
        console.log(chalk.green(` already running`));
        runningCount++;
        if (service.ports) exposedPorts.push(...service.ports);
        console.log('');
        continue;
      }

      // 2. Check if image exists, if not, pull with real logs
      try {
        await exec(`docker image inspect ${service.image}`);
      } catch (e) {
        console.log(chalk.gray(`  Pulling image ${service.image}...`));
        await runInteractive('docker', ['pull', service.image]);
      }

      // 3. Check if container exists but is stopped
      try {
        const { stdout } = await exec(`docker ps -a -q -f name=^vmdock-${name}$`);
        if (stdout.trim()) {
          await exec(`docker rm vmdock-${name}`);
        }
      } catch (e) { }

      // 4. Start container with spinner and timer
      const spinner = ora(`Starting container...`).start();
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        spinner.text = `Starting container (${elapsed}s)...`;
      }, 1000);

      // Build docker run command
      let runArgs = ['run', '-d', '--name', `vmdock-${name}`];

      if (service.ports) {
        service.ports.forEach(port => {
          runArgs.push('-p', port);
          exposedPorts.push(port);
        });
      }

      if (service.environment) {
        for (const [key, value] of Object.entries(service.environment)) {
          runArgs.push('-e', `${key}=${value}`);
        }
      }

      if (config.shared && config.shared.vm_mount && config.shared.docker_volume) {
        runArgs.push('-v', `${config.shared.vm_mount}:${config.shared.docker_volume}`);
      }

      runArgs.push(service.image);

      // Execute run
      await exec(`docker ${runArgs.join(' ')}`);

      // Setup port proxies
      if (service.ports) {
        service.ports.forEach(portPair => {
          const hostPort = portPair.split(':')[0];
          setupPortProxy(ip, hostPort);
        });
      }

      clearInterval(timer);
      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      spinner.succeed(chalk.green(`started successfully (${totalTime}s)`));
      runningCount++;
    } catch (error) {
      console.error(chalk.red(`  ✗ Failed to start ${name}`));
      console.error(chalk.gray(`    ${error.message}`));
    }
    console.log('');
  }

  // Summary
  console.log(chalk.cyan('Summary:'));
  console.log(`  Services running: ${chalk.green(runningCount)}/${serviceNames.length}`);

  if (exposedPorts.length > 0) {
    const isUserAdmin = isAdmin();
    console.log(`  Ports accessible from Windows (${isUserAdmin ? 'via localhost' : 'via VM IP'}):`);

    exposedPorts.forEach(p => {
      const winPort = p.split(':')[0];
      const host = isUserAdmin ? 'localhost' : ip;
      console.log(`    - ${chalk.yellow(`${host}:${winPort}`)}`);
    });

    if (!isUserAdmin) {
      console.log(chalk.gray('\n  Note: Run as Administrator to enable "localhost" access.'));
    }
  }
  console.log('');
}
