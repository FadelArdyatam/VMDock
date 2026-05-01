#!/usr/bin/env node

import { Command } from 'commander';
import initCommand from '../src/commands/init.js';
import upCommand from '../src/commands/up.js';
import downCommand from '../src/commands/down.js';
import psCommand from '../src/commands/ps.js';
import statusCommand from '../src/commands/status.js';
import execCommand from '../src/commands/exec.js';
import logsCommand from '../src/commands/logs.js';
import shareCommand from '../src/commands/share.js';
import { showBanner } from '../src/utils/ui.js';
import { checkDockerCli } from '../src/utils/check-env.js';

showBanner();

if (!checkDockerCli()) {
  process.exit(1);
}

const program = new Command();

program
  .name('vmdock')
  .description('CLI to connect Docker in Linux VM with Windows host')
  .version('1.0.0');

program
  .command('init')
  .description('Initial setup: detect VM IP, configure DOCKER_HOST, setup shared folder path')
  .action(initCommand);

program
  .command('up')
  .description('Start all services from vmdock.yml')
  .action(upCommand);

program
  .command('down')
  .description('Stop all services')
  .action(downCommand);

program
  .command('ps')
  .description('View running services')
  .action(psCommand);

program
  .command('status')
  .description('Check connection to VM, Docker Engine, and shared folder')
  .action(statusCommand);

program
  .command('exec')
  .description('Shell into a container')
  .argument('<service>', 'Name of the service')
  .argument('[command...]', 'Command to run', ['sh'])
  .action((service, command) => execCommand([service, ...command]));

program
  .command('logs')
  .description('View container logs')
  .argument('<service>', 'Name of the service')
  .action((service) => logsCommand([service]));

program
  .command('share')
  .description('Check and repair VMware shared folder mount status')
  .action(shareCommand);

program.parse();
