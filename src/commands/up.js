import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';

export default async function upCommand() {
  const { config } = loadConfig();

  // Set DOCKER_HOST for the current process so execSync uses it
  const dockerHost = `tcp://${config.vm.ip}:${config.vm.docker_port}`;
  process.env.DOCKER_HOST = dockerHost;

  console.log(chalk.cyan(`\n🚀 Starting VMDock services via ${dockerHost}...\n`));

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
    const spinner = ora(`Starting ${name}...`).start();

    try {
      // Check if container is already running
      const isRunning = execSync(`docker ps -q -f name=^vmdock-${name}$`).toString().trim();
      
      if (isRunning) {
        spinner.succeed(chalk.green(`✓ ${name} is already running`));
        runningCount++;
        if (service.ports) {
          exposedPorts.push(...service.ports);
        }
        continue;
      }

      // Check if container exists but is stopped
      const exists = execSync(`docker ps -a -q -f name=^vmdock-${name}$`).toString().trim();
      if (exists) {
        execSync(`docker rm vmdock-${name}`);
      }

      // Build docker run command
      let runCmd = `docker run -d --name vmdock-${name}`;

      // Add ports
      if (service.ports && Array.isArray(service.ports)) {
        service.ports.forEach(port => {
          runCmd += ` -p ${port}`;
          exposedPorts.push(port);
        });
      }

      // Add environment variables
      if (service.environment) {
        for (const [key, value] of Object.entries(service.environment)) {
          runCmd += ` -e ${key}="${value}"`;
        }
      }

      // Add volume if specified
      if (config.shared && config.shared.vm_mount && config.shared.docker_volume) {
        runCmd += ` -v ${config.shared.vm_mount}:${config.shared.docker_volume}`;
      }

      // Add image
      if (!service.image) {
        throw new Error(`No image specified for service ${name}`);
      }
      runCmd += ` ${service.image}`;

      // Execute run command
      execSync(runCmd, { stdio: 'ignore' });
      
      spinner.succeed(chalk.green(`✓ ${name} started successfully`));
      runningCount++;
    } catch (error) {
      spinner.fail(chalk.red(`✗ Failed to start ${name}`));
      console.error(chalk.gray(`  ${error.message}`));
    }
  }

  // Summary
  console.log(chalk.cyan('\n📊 Summary:'));
  console.log(`Services running: ${chalk.green(runningCount)}/${serviceNames.length}`);
  if (exposedPorts.length > 0) {
    console.log('Ports accessible from Windows:');
    exposedPorts.forEach(p => {
      const winPort = p.split(':')[0];
      console.log(`  - ${chalk.yellow(`localhost:${winPort}`)}`);
    });
  }
  console.log('');
}
