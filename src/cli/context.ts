import { Command } from 'commander';
import { ServerAccess } from './server-access';

export class JolokiaEndpoint {
  isRemote = (): boolean => {
    return false;
  };
  getUrl = (): string => {
    return '';
  };

  getBrokerName = (): string => {
    return '';
  };

  setBrokerName = (name: string): void => {
    throw new Error('Method not implemented.');
  };
}

export class RemoteJolokiaEndpoint extends JolokiaEndpoint {
  endpointName: string;

  constructor(endpointName: string) {
    super();
    this.endpointName = endpointName;
  }

  isRemote = (): boolean => {
    return true;
  };

  getBrokerName = (): string => {
    return this.endpointName;
  };

  setBrokerName = (name: string) => {
    this.endpointName = name;
  };
}

export class LocalJolokiaEndpoint extends JolokiaEndpoint {
  brokerName: string;
  userName: string;
  password: string;
  jolokiaHost: string;
  scheme: string;
  port: string;
  accessToken: string;
  url: string;

  constructor(
    endpointName: string,
    userName: string,
    password: string,
    jolokiaHost: string,
    scheme: string,
    port: string,
    accessToken: string,
  ) {
    super();
    this.brokerName = endpointName;
    this.userName = userName;
    this.password = password;
    this.jolokiaHost = jolokiaHost;
    this.scheme = scheme;
    this.port = port;
    this.accessToken = accessToken;
  }

  getBrokerName = (): string => {
    return this.brokerName;
  };

  setBrokerName = (name: string) => {
    this.brokerName = name;
  };

  getUrl = () => {
    return this.scheme + '://' + this.jolokiaHost + ':' + this.port;
  };
}

const replaceErrors = (key: any, value: any) => {
  if (key === 'details') {
    if (value instanceof Error) {
      const error = {};

      Object.getOwnPropertyNames(value).forEach(function (propName) {
        error[propName] = value[propName];
      });

      return error;
    }
    if (value instanceof Response) {
      return { status: value.status, statusText: value.statusText };
    }
  }

  return value;
};

export const printResult = (result: object) => {
  console.log(JSON.stringify(result, null, 2));
};

export const printError = (message: string, detail?: object | string) => {
  console.error(
    JSON.stringify(
      {
        message: 'Error: ' + message,
        details: detail ? detail : '',
      },
      replaceErrors,
      2,
    ),
  );
};

export class CommandContext {
  apiClient: ServerAccess;
  currentEndpoint: JolokiaEndpoint;

  constructor(
    serverAccess: ServerAccess,
    endpointUrl: string,
    endpoint: JolokiaEndpoint | null,
  ) {
    this.apiClient = serverAccess;

    if (endpointUrl) {
      const url = new URL(endpointUrl);
      this.currentEndpoint = new LocalJolokiaEndpoint(
        'current',
        url.username,
        url.password,
        url.hostname,
        url.protocol.substring(0, url.protocol.length - 1),
        this.getActualPort(url),
        '',
      );
    } else {
      this.currentEndpoint = endpoint as JolokiaEndpoint;
    }
  }

  getActualPort(url: URL): string {
    return url.port === ''
      ? url.protocol === 'http:'
        ? '80'
        : '443'
      : url.port;
  }

  // this login is used to login a jolokia endpoint
  async login(): Promise<number> {
    const current = this.currentEndpoint as LocalJolokiaEndpoint;
    if (!current || current.accessToken !== '') {
      return 0;
    }
    const result = await this.apiClient.login(current);
    if (result.status === 'success') {
      const accessToken = result['jolokia-session-id'];
      this.apiClient.updateClientHeader('jolokia-session-id', accessToken);
      current.accessToken = accessToken;
      return 0;
    }
    return 1;
  }

  async processCommand(args: string[]): Promise<number> {
    let retValue = 0;
    let resolvedArgs = args;
    if (args.length === 1) {
      // the command is quoted
      resolvedArgs = args[0].trim().split(' ');
    }

    switch (resolvedArgs[0]) {
      case 'get': {
        const getCmd = this.newGetCmd();
        try {
          await getCmd.parseAsync(resolvedArgs, { from: 'electron' });
        } catch (e) {
          printError('failed to execute get command', e);
          retValue = 1;
        }
        break;
      }
      default:
        printError('unknown command', args);
        retValue = 1;
        break;
    }
    return retValue;
  }

  parseGetPath = async (
    path: string,
    callback: (targetType: string, remoteEndpoint: string) => Promise<void>,
  ): Promise<void> => {
    //for non-interactive mode if
    // path = '/' : to get all components of the target broker
    // path = '/<type>' : to get all components of <type>
    // path = '<type>' : same as '/<type>'
    let targetType: string;
    let targetEndpoint: string = null;
    if (path === '/') {
      const currentTarget = this.currentEndpoint?.getBrokerName();
      if (currentTarget) {
        path = currentTarget + path;
      }
    }
    if (path.startsWith('@') && !path.includes('/')) {
      path = path + '/';
    }
    const pathElements = path.split('/');
    if (pathElements.length === 1) {
      targetType = pathElements[0];
    } else if (pathElements.length === 2) {
      targetType = pathElements[1];
      if (pathElements[0].startsWith('@')) {
        targetEndpoint = pathElements[0].substring(1);
      }
    } else {
      throw 'Invalid target expression: ' + path;
    }
    await callback(targetType, targetEndpoint);
  };

  newGetCmd(): Command {
    const getCmd = new Command('get')
      .description('get information from a endpoint')
      .argument(
        '<path>',
        'path of the component with format [[@]endpointName/componentType] where @ means a remote target',
      )
      .argument('[compName]', 'name of the component', '')
      .option(
        '-a, --attributes <attributeNames...>',
        'get attributes from component',
      )
      .option(
        '-o, --operations <operationNames...>',
        'get operations info from component',
      )
      .exitOverride()
      .showHelpAfterError()
      .action(async (path, compName, options, cmd): Promise<void> => {
        await this.parseGetPath(path, async (targetType, remoteEndpoint) => {
          if (compName === '') {
            // read all comps of type
            if (targetType === '') {
              // '/' get broker info
              if (
                options.attributes?.length > 0 ||
                options.operations?.length > 0
              ) {
                if (options.attributes?.length > 0) {
                  await this.getComponentAttributes(
                    remoteEndpoint,
                    'broker',
                    '',
                    options.attributes[0] === '*' ? null : options.attributes,
                  );
                }
                if (options.operations?.length > 0) {
                  await this.getComponentOperations(
                    remoteEndpoint,
                    'broker',
                    '',
                    options.operations[0] === '*' ? null : options.operations,
                  );
                }
              } else {
                await this.getComponent(remoteEndpoint, 'broker', '');
              }
            } else if (targetType === '*') {
              // '/*' to get all components
              if (options.attributes?.length > 0) {
                throw Error('cannot specify attributes for all components');
              } else {
                await this.getAllComponents(remoteEndpoint, '');
              }
            } else {
              // '/type' read all comps of type
              if (options.attributes?.length > 0) {
                throw 'need a component name to get attributes of';
              }
              await this.getAllComponents(remoteEndpoint, targetType);
            }
          } else {
            if (options.attributes?.length > 0) {
              // '/type or type -a ...' read one comp's attributes
              await this.getComponentAttributes(
                remoteEndpoint,
                targetType,
                compName,
                options.attributes[0] === '*' ? null : options.attributes,
              );
            } else {
              //nothing specified, just return type info
              await this.getComponent(remoteEndpoint, targetType, compName);
            }
          }
        });
      });
    return getCmd;
  }

  async getComponent(
    remoteEndpoint: string,
    targetType: string,
    compName: string,
  ): Promise<number> {
    switch (targetType) {
      case 'broker':
        return await this.getBroker(remoteEndpoint);
      case 'queue':
      case 'queues':
        return await this.getQueue(remoteEndpoint, compName);
      case 'address':
      case 'addresses':
        return await this.getAddress(remoteEndpoint, compName);
      case 'acceptor':
      case 'acceptors':
        return await this.getAcceptor(remoteEndpoint, compName);
      default:
        printError('component type not supported', targetType);
        return 1;
    }
  }

  async getAllBrokerComponents(remoteTarget: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getBrokerComponents(remoteTarget);
      printResult(result);
    } catch (ex) {
      printError('failed to get broker components', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getAllQueueComponents(remoteTarget: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getQueues(remoteTarget);
      printResult(result);
    } catch (ex) {
      printError(
        'failed to get queues at ' + remoteTarget ? remoteTarget : 'current',
        ex,
      );
      retValue = 1;
    }
    return retValue;
  }

  async getAllAddresses(remoteTarget: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getAddresses(remoteTarget);
      printResult(result);
    } catch (ex) {
      printError('failed to get addresses', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getAllAcceptors(remoteTarget: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getAcceptors(remoteTarget);
      printResult(result);
    } catch (ex) {
      printError('failed to get acceptors', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getAllClusterConnections(remoteTarget: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getClusterConnections(remoteTarget);
      printResult(result);
    } catch (ex) {
      printError('failed to get cluster connections', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getAllComponents(
    remoteEndpoint: string,
    targetType: string,
  ): Promise<number> {
    switch (targetType) {
      case '':
        return await this.getAllBrokerComponents(remoteEndpoint);
      case 'queue':
      case 'queues':
        return await this.getAllQueueComponents(remoteEndpoint);
      case 'address':
      case 'addresses':
        return await this.getAllAddresses(remoteEndpoint);
      case 'acceptor':
      case 'acceptors':
        return await this.getAllAcceptors(remoteEndpoint);
      case 'cluster-connection':
      case 'cluster-connections':
        return await this.getAllClusterConnections(remoteEndpoint);
      case 'bridge':
      case 'bridges':
        printError('not implemented!');
        return 1;
      case 'broadcast-group':
      case 'broadcast-groups':
        printError('not implemented!');
        return 1;
      default:
        printError('component type not supported', targetType);
        return 1;
    }
  }

  async getQueue(remoteEndpoint: string, compName: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getQueues(remoteEndpoint);
      const queues = result.filter((q) => q.name === compName);
      printResult(queues);
    } catch (ex) {
      printError('failed to get queues', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getAddress(remoteTarget: string, compName: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getAddresses(remoteTarget);
      const addresses = result.filter((a) => a.name === compName);
      printResult(addresses);
    } catch (ex) {
      printError('failed to get addresses', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getAcceptor(remoteTarget: string, compName: string): Promise<number> {
    let retValue = 0;
    try {
      const result = await this.apiClient.getAcceptors(remoteTarget);
      const acceptors = result.filter((a) => a.name === compName);
      printResult(acceptors);
    } catch (ex) {
      printError('failed to get acceptors', ex);
      retValue = 1;
    }
    return retValue;
  }

  async getBrokerOperations(
    remoteTarget: string,
    operations: string[],
  ): Promise<number> {
    let retValue = 0;
    const opts = operations === null ? {} : { names: operations };
    try {
      const values = await this.apiClient.readBrokerOperations(remoteTarget);

      let opSet: Set<string> = null;
      if (opts.names) {
        opSet = new Set();
        opts.names.forEach((n) => {
          // deal with commas
          const names = n.split(',');
          names.forEach((m) => {
            if (m !== '') {
              opSet.add(m);
            }
          });
        });
      }

      const result = new Array<any>();
      for (const prop in values.op) {
        if (
          Object.prototype.hasOwnProperty.call(values.op, prop) &&
          (opSet === null || opSet.has(prop))
        ) {
          result.push({ [prop]: values.op[prop] });
        }
      }
      printResult(result);
    } catch (e) {
      printError('failed to read operationss', e);
      retValue = 1;
    }
    return retValue;
  }

  async getBrokerAttributes(
    remoteTarget: string,
    attributes: string[],
  ): Promise<number> {
    let retValue = 0;
    const opts = attributes === null ? {} : { names: attributes };
    try {
      const values = await this.apiClient.readBrokerAttributes(
        remoteTarget,
        opts,
      );
      printResult(values);
    } catch (e) {
      printError('failed to read attributes', e);
      retValue = 1;
    }
    return retValue;
  }

  async getQueueAttributes(
    remoteTarget: string,
    compName: string,
    attributes: string[],
  ): Promise<number> {
    let retValue = 0;
    const result = await this.apiClient.getQueues(remoteTarget);
    const queues = result.filter((q) => q.name === compName);
    for (let i = 0; i < queues.length; i++) {
      const q = queues[i];
      const opts =
        attributes === null
          ? {
              name: compName,
              address: q.address?.name,
              'routing-type': q['routing-type'],
            }
          : {
              name: compName,
              address: q.address?.name,
              'routing-type': q['routing-type'],
              attrs: attributes,
            };

      try {
        const values = await this.apiClient.readQueueAttributes(
          remoteTarget,
          opts,
        );
        printResult(values);
      } catch (e) {
        printError('failed to read queue attributes', e);
        retValue = 1;
        break;
      }
    }
    return retValue;
  }

  async getAddressAttributes(
    remoteTarget: string,
    compName: string,
    attributes: string[],
  ): Promise<number> {
    let retValue = 0;
    const opts =
      attributes === null
        ? { name: compName }
        : { name: compName, attrs: attributes };
    try {
      const values = await this.apiClient.readAddressAttributes(
        remoteTarget,
        opts,
      );
      printResult(values);
    } catch (e) {
      printError('failed to read address attributes', e);
      retValue = 1;
    }
    return retValue;
  }

  async getAcceptorAttributes(
    remoteTarget: string,
    compName: string,
    attributes: string[],
  ): Promise<number> {
    let retValue = 0;
    const opts =
      attributes === null
        ? { name: compName }
        : { name: compName, attrs: attributes };
    try {
      const values = await this.apiClient.readAcceptorAttributes(
        remoteTarget,
        opts,
      );
      printResult(values);
    } catch (e) {
      printError('failed to read acceptor attributes', e);
      retValue = 1;
    }
    return retValue;
  }
  async getClusterConnectionAttributes(
    remoteTarget: string,
    compName: string,
    attributes: string[],
  ): Promise<number> {
    let retValue = 0;
    const opts =
      attributes === null
        ? { name: compName }
        : { name: compName, attrs: attributes };
    try {
      const values = await this.apiClient.readClusterConnectionAttributes(
        remoteTarget,
        opts,
      );
      printResult(values);
    } catch (e) {
      printError('failed to read cluster connection attributes', e);
      retValue = 1;
    }
    return retValue;
  }

  async getComponentAttributes(
    remoteEndpoint: string,
    targetType: string,
    compName: string,
    attributes: string[],
  ): Promise<number> {
    switch (targetType) {
      case 'broker':
        return await this.getBrokerAttributes(remoteEndpoint, attributes);
      case 'queue':
      case 'queues':
        return await this.getQueueAttributes(
          remoteEndpoint,
          compName,
          attributes,
        );
      case 'address':
      case 'addresses':
        return await this.getAddressAttributes(
          remoteEndpoint,
          compName,
          attributes,
        );
      case 'acceptor':
      case 'acceptors':
        return await this.getAcceptorAttributes(
          remoteEndpoint,
          compName,
          attributes,
        );
      case 'cluster-connection':
      case 'cluster-connections':
        return await this.getClusterConnectionAttributes(
          remoteEndpoint,
          compName,
          attributes,
        );
      default:
        printError('Error: component type not supported', targetType);
        return 1;
    }
  }

  async getComponentOperations(
    remoteEndpoint: string,
    targetType: string,
    compName: string,
    operations: string[],
  ): Promise<number> {
    switch (targetType) {
      case 'broker':
        return await this.getBrokerOperations(remoteEndpoint, operations);
      case 'queue':
      case 'queues':
      case 'address':
      case 'addresses':
      case 'acceptor':
      case 'acceptors':
      case 'cluster-connection':
      case 'cluster-connections':
      default:
        printError('Error: component type not supported', targetType);
        return 1;
    }
  }

  async getBroker(remoteEndpoint: string): Promise<number> {
    let retValue = 0;
    try {
      const values = await this.apiClient.getBrokers(remoteEndpoint);
      printResult(values);
    } catch (ex) {
      printError('failed to get brokers', ex);
      retValue = 1;
    }
    return retValue;
  }
}

export class InteractiveCommandContext extends CommandContext {
  readonly endpoints: Map<string, CommandContext>;

  constructor(
    serverAccess: ServerAccess,
    endpointMap: Map<string, CommandContext>,
  ) {
    super(serverAccess, '', null);
    this.endpoints = endpointMap;
  }

  getPrompt(): string {
    const currentUser = this.apiClient.currentUser ?? undefined;
    if (this.currentEndpoint) {
      if (currentUser) {
        return currentUser + ':' + this.currentEndpoint.getBrokerName() + '> ';
      }
      return this.currentEndpoint.getBrokerName() + '> ';
    }
    if (currentUser) {
      return currentUser + '> ';
    }
    return '> ';
  }

  hasEndpoint(endpointName: string): boolean {
    return this.endpoints.has(endpointName);
  }

  newAddCmd(): Command {
    const addCmd = new Command('add')
      .argument('<name>', 'name of the endpoint')
      .argument('<endpoint>', 'the endpoint url')
      .option('-u, --user [userName]', 'the user name', 'user')
      .option('-p, --password [password]', 'the password', 'password')
      .exitOverride()
      .showHelpAfterError()
      .description(
        'add an jolokia endpoint, example: add mybroker0 http://localhost:8161',
      )
      .action(async (endpointName, endpointUrl, options) => {
        const url = new URL(endpointUrl);
        if (this.hasEndpoint(endpointName)) {
          printError('endpoint already exists!');
        }

        const newEndpoint = new LocalJolokiaEndpoint(
          endpointName,
          options.user,
          options.password,
          url.hostname,
          url.protocol.substring(0, url.protocol.length - 1),
          this.getActualPort(url),
          '',
        );
        const context = new CommandContext(this.apiClient, '', newEndpoint);
        try {
          await context.login();
          context.currentEndpoint.setBrokerName(endpointName);
          this.endpoints.set(endpointName, context);
          this.switchContext(context);
        } catch (ex) {
          printError('failed to login', ex);
        }
      });

    return addCmd;
  }

  addEndpoint = async (args: string[]): Promise<number> => {
    let retValue = 0;
    const addCmd = this.newAddCmd();
    try {
      await addCmd.parseAsync(args, { from: 'electron' }).catch(() => {
        //commander would print the error message
        retValue = 1;
      });
    } catch (ex) {
      printError('failed to execute add command', ex);
      retValue = 1;
    }
    return retValue;
  };

  getEndpoint = (endpointName: string): CommandContext | undefined => {
    return this.endpoints.get(endpointName);
  };

  listJolokiaEndpoints = async (): Promise<number> => {
    const endpointList = new Array<string>();
    this.endpoints.forEach((context, key) => {
      endpointList.push(key + '(local): ' + context.currentEndpoint.getUrl());
    });

    const remoteEndpoints = await this.apiClient.listEndpoints();
    remoteEndpoints.forEach((e) => {
      endpointList.push('@' + e.name + ': ' + e.url);
    });
    printResult(endpointList);

    return 0;
  };

  switchContext(target: CommandContext) {
    this.apiClient = target.apiClient;
    this.currentEndpoint = target.currentEndpoint;
  }

  newSwitchCmd(): Command {
    const switchCmd = new Command('switch')
      .argument('<endpointName>')
      .description('switch to a jolokia endpoint')
      .exitOverride()
      .action(async (endpointName) => {
        if (endpointName.startsWith('@')) {
          this.currentEndpoint = new RemoteJolokiaEndpoint(endpointName);
        } else {
          if (!this.hasEndpoint(endpointName)) {
            printError('no such endpoint', endpointName);
          } else {
            const target = this.getEndpoint(endpointName) as CommandContext;
            this.switchContext(target);
          }
        }
      });
    return switchCmd;
  }

  async switchJolokiaEndpoint(args: string[]): Promise<number> {
    let retValue = 0;
    const switchCmd = this.newSwitchCmd();
    try {
      switchCmd.parse(args, { from: 'electron' });
    } catch (ex) {
      printError('failed to execute switch command', ex);
      retValue = 1;
    }
    return retValue;
  }

  // command path is in form:
  // [[@]endpointName]/[componentType]
  // if @ is present it means endpointName is targeted at api server
  // if @ is not present it means a local endpoint
  // if endpointName part is absent at all it means current local endpoint
  // componentType is the target component of a broker (queues, address, etc)
  // if componentType is absent it means all components of the broker
  // if path is / it gets the mbean info of the current local broker.
  getContextForGetCmd(path: string): CommandContext {
    if (!path) {
      return this;
    }

    const isRemoteTarget =
      path.startsWith('@') || this.currentEndpoint?.isRemote();

    if (!isRemoteTarget) {
      if (this.endpoints.size === 0) {
        throw Error('there is no endpoint for command');
      }

      const elements = path.split('/');
      if (elements.length === 2 && elements[0] !== '') {
        if (this.hasEndpoint(elements[0])) {
          if (elements[0] === this.currentEndpoint?.getBrokerName()) {
            return this;
          } else {
            return this.getEndpoint(elements[0]) as CommandContext;
          }
        } else {
          throw Error('target endpoint not exist: ' + elements[0]);
        }
      }
    }
    return this;
  }

  async processSingleCommand(cmd: string): Promise<number> {
    const args = cmd.trim().split(' ');
    switch (args[0]) {
      case '':
        return 0;
      case 'add':
        return await this.addEndpoint(args);
      case 'list':
        return await this.listJolokiaEndpoints();
      case 'switch':
        return this.switchJolokiaEndpoint(args);
      case 'get': {
        let context: CommandContext;
        try {
          context = this.getContextForGetCmd(args[1]);
        } catch (ex) {
          printError('failed to get context', ex);
          return 1;
        }
        return await context.processCommand([cmd.trim()]);
      }
      default: {
        printError('unknown command');
        return 1;
      }
    }
  }
}
