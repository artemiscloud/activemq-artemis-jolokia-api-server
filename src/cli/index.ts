#! /usr/bin/env -S node --no-warnings

import { Command } from 'commander';
import dotenv from 'dotenv';

import { ServerAccess } from './server-access';
import { printError } from './context';
import { Cli } from './cli';

dotenv.config({ path: '.cli.env' });

if (process.env['NODE_TLS_REJECT_UNAUTHORIZED'] !== '0') {
  console.log('Warning: TLS Certificate check is disabled.');
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

const program = new Command();
program
  .version('1.0.0')
  .description('CLI tool for ActiveMQ Artemis Jolokia API Server')
  .argument('[command]', 'the command to be executed')
  .option(
    '-l, --url [api-server-url]',
    'the url of api server',
    'https://localhost:9443',
  )
  .option('-i, --interactive', 'run in interactive mode', false)
  .option('-e, --endpoint [endpoint]', 'target jolokia endpoint url')
  .option(
    '-u, --user [userName]',
    'user name to log in to the api server if security is enabled',
    false,
  )
  .option(
    '-p, --password [password]',
    'user password to log in to the api server',
    false,
  )
  .parse(process.argv);

const cliOpts = program.opts();

const apiServerUrl = cliOpts.url;

const serverAccess = new ServerAccess(apiServerUrl);

serverAccess
  .checkApiServer()
  .then((result) => {
    if (!result) {
      printError('The api server is not available', apiServerUrl);
      process.exit(1);
    }
    Cli.start(serverAccess, cliOpts, program);
  })
  .catch((e) => {
    printError('Error checking api server: ' + apiServerUrl, e);
    process.exit(1);
  });
