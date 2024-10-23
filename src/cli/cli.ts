import figlet from 'figlet';
import readline from 'readline';
import { stdin, stdout } from 'process';

import {
  CommandContext,
  InteractiveCommandContext,
  printError,
} from './context';
import { ServerAccess } from './server-access';
import { Command, OptionValues } from 'commander';

export class Cli {
  static start = (
    serverAccess: ServerAccess,
    options: OptionValues,
    program: Command,
  ) => {
    let userName: string;
    let password: string;
    let shouldLogin = false;

    if (options.user) {
      if (!options.password) {
        printError('Error: no password');
        process.exit(1);
      }
      userName = options.user;
      password = options.password;
      shouldLogin = true;
    } else {
      if (process.env.SERVER_USER_NAME) {
        if (!process.env.SERVER_PASSWORD) {
          printError('Error: no password');
          process.exit(1);
        }
        userName = process.env.SERVER_USER_NAME;
        password = process.env.SERVER_PASSWORD;
        shouldLogin = true;
      }
    }

    if (shouldLogin) {
      serverAccess
        .loginServer(userName, password)
        .then((res) => {
          if (res.bearerToken) {
            serverAccess.updateBearerToken(res.bearerToken);
          }
          serverAccess.setLoginUser(userName);
          if (res.status !== 'succeed') {
            printError('Failed to login server', res);
            process.exit(1);
          }
          Cli.internalStart(serverAccess, options, program);
        })
        .catch((err) => {
          printError('Failed to login server', err);
          process.exit(1);
        });
    } else {
      Cli.internalStart(serverAccess, options, program);
    }
  };

  static internalStart = (
    serverAccess: ServerAccess,
    options: OptionValues,
    program: Command,
  ) => {
    if (options.interactive) {
      const endpointMap = new Map<string, CommandContext>();
      const commandContext = new InteractiveCommandContext(
        serverAccess,
        endpointMap,
      );

      const rl = readline.createInterface({
        input: stdin,
        output: stdout,
      });
      program.exitOverride(); //avoid exit on error

      const runMain = async () => {
        rl.question(commandContext.getPrompt(), function (command) {
          if (command === 'exit') {
            return rl.close();
          }
          commandContext
            .processSingleCommand(command)
            .then(() => {
              runMain();
            })
            .catch((e) => {
              printError('error processing command', e);
              runMain();
            });
        });
      };
      console.log(figlet.textSync('Api Server Cli'));
      runMain();
    } else {
      const commandContext = new CommandContext(
        serverAccess,
        program.opts().endpoint,
        null,
      );

      commandContext
        .login()
        .then((value) => {
          if (value === 0) {
            commandContext
              .processCommand(program.args)
              .then((result) => {
                process.exit(result);
              })
              .catch((e) => {
                printError('failed to run command', e);
                program.help();
              });
          } else {
            program.help();
          }
        })
        .catch((err) => {
          printError('failed to run command', err);
          program.help();
        });
    }
  };
}
