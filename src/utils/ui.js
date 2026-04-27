import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

export const showBanner = () => {
  const banner = `
  __     ____  __ ____             _    
  \\ \\   / /  \\/  |  _ \\  ___   ___| | __
   \\ \\ / /| |\\/| | | | |/ _ \\ / __| |/ /
    \\ V / | |  | | |_| | (_) | (__|   < 
     \\_/  |_|  |_|____/ \\___/ \\___|_|\\_\\
  `;

  // Create a gradient effect manually using chalk
  const lines = banner.split('\n');
  const colors = [
    chalk.cyan.bold,
    chalk.cyanBright.bold,
    chalk.blueBright.bold,
    chalk.blue.bold,
    chalk.blue.bold,
    chalk.blue.bold
  ];

  console.log('\n');
  lines.forEach((line, i) => {
    if (line.trim()) {
      const color = colors[i % colors.length] || colors[colors.length - 1];
      console.log(color(line));
    }
  });

  console.log(
    `  ${chalk.white.dim('v' + packageJson.version)} ${chalk.gray('•')} ${chalk.blueBright('Bridge your Windows to Linux Docker')}`
  );
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log('\n');
};

export const logger = {
  info: (msg) => console.log(`${chalk.blue('ℹ')} ${msg}`),
  success: (msg) => console.log(`${chalk.green('✔')} ${msg}`),
  warn: (msg) => console.log(`${chalk.yellow('⚠')} ${msg}`),
  error: (msg) => console.log(`${chalk.red('✖')} ${msg}`),
  step: (msg) => console.log(`${chalk.cyan('➜')} ${msg}`),
};
