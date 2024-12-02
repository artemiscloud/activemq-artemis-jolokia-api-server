import { logger } from '../../utils/logger';
import {
  AuthenticationData,
  AuthHandler,
  AuthOptions,
  CreateAuthHandler,
  Endpoint,
} from '../../utils/security_util';
import fetch from 'node-fetch';

// search the broker
const brokerSearchPattern = 'org.apache.activemq.artemis:broker=*';
// search all broker top level components
const brokerComponentsSearchPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",*';
// search addresses
const addressComponentsSearchPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",component=addresses,address=*';
const acceptorComponentsSearchPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",component=acceptors,name=*';
const queueComponentsSearchPattern =
  'org.apache.activemq.artemis:broker=*,component=addresses,address="ADDRESS_NAME",subcomponent=queues,*';
// search cluster connections
const clusterConnectionComponentsSearchPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",component=cluster-connections,name=*';

// list a Queue's operations and attributes
const queueDetailsListPattern =
  'org.apache.activemq.artemis:address="ADDRESS_NAME",broker="BROKER_NAME",component=addresses,queue="QUEUE_NAME",routing-type="ROUTING_TYPE"/subcomponent=queues';
const addressDetailsListPattern =
  'org.apache.activemq.artemis:address="ADDRESS_NAME",broker="BROKER_NAME"/component=addresses';
const acceptorDetailsListPattern =
  'org.apache.activemq.artemis:name="ACCEPTOR_NAME",broker="BROKER_NAME"/component=acceptors';
const clusterConnectionDetailsListPattern =
  'org.apache.activemq.artemis:name="CLUSTER_CONNECTION_NAME",broker="BROKER_NAME"/component=cluster-connections';

const brokerDetailsListPattern =
  'org.apache.activemq.artemis/broker="BROKER_NAME"';

const brokerComponentPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME"';
const addressComponentPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",component=addresses,address="ADDRESS_NAME"';
const acceptorComponentPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",component=acceptors,name="ACCEPTOR_NAME"';
const queueComponentPattern =
  'org.apache.activemq.artemis:address="ADDRESS_NAME",broker="BROKER_NAME",component=addresses,queue="QUEUE_NAME",routing-type="ROUTING_TYPE",subcomponent=queues';
const clusterConnectionComponentPattern =
  'org.apache.activemq.artemis:broker="BROKER_NAME",component=cluster-connections,name="CLUSTER_CONNECTION_NAME"';

export enum ComponentType {
  ALL = 'broker-components',
  BROKER = 'broker',
  ADDRESS = 'address',
  QUEUE = 'queue',
  ACCEPTOR = 'acceptor',
  CLUSTER_CONNECTION = 'cluster-connection',
}

export class ArtemisJolokia {
  readonly name: string;
  readonly serverUrl: string;
  readonly protocol: string;
  readonly port: string;
  readonly hostName: string;
  brokerName: string;
  readonly baseUrl: string;
  authHandlers: Array<AuthHandler>;

  static readonly KEY_COMPONENT_TYPE = 'component-type';
  static readonly KEY_COMPONENT_NAME = 'component-name';

  componentMap = new Map<ComponentType, string>([
    [ComponentType.BROKER, brokerSearchPattern],
    [ComponentType.ALL, brokerComponentsSearchPattern],
    [ComponentType.ADDRESS, addressComponentsSearchPattern],
    [ComponentType.QUEUE, queueComponentsSearchPattern],
    [ComponentType.ACCEPTOR, acceptorComponentsSearchPattern],
    [
      ComponentType.CLUSTER_CONNECTION,
      clusterConnectionComponentsSearchPattern,
    ],
  ]);

  componentDetailsMap = new Map<ComponentType, string>([
    [ComponentType.BROKER, brokerDetailsListPattern],
    [ComponentType.QUEUE, queueDetailsListPattern],
    [ComponentType.ADDRESS, addressDetailsListPattern],
    [ComponentType.ACCEPTOR, acceptorDetailsListPattern],
    [ComponentType.CLUSTER_CONNECTION, clusterConnectionDetailsListPattern],
  ]);

  componentNameMap = new Map<ComponentType, string>([
    [ComponentType.BROKER, brokerComponentPattern],
    [ComponentType.ADDRESS, addressComponentPattern],
    [ComponentType.ACCEPTOR, acceptorComponentPattern],
    [ComponentType.QUEUE, queueComponentPattern],
    [ComponentType.CLUSTER_CONNECTION, clusterConnectionComponentPattern],
  ]);

  constructor(endpoint: Endpoint, isFromClient = false) {
    const url = new URL(endpoint.url);

    this.name = endpoint.name;
    this.protocol = url.protocol.substring(0, url.protocol.length - 1);
    this.port = url.port
      ? url.port
      : ArtemisJolokia.getDefaultPort(this.protocol);
    this.hostName = url.hostname;
    this.brokerName = '';
    this.serverUrl = this.protocol + '://' + this.hostName + ':' + this.port;

    this.baseUrl =
      this.serverUrl + ArtemisJolokia.makeJolokiaPrefix(endpoint.jolokiaPrefix);

    this.createAuthHandlers(endpoint.auth, isFromClient);
  }

  createAuthHandlers = (auth: AuthenticationData[], isFromClient = false) => {
    this.authHandlers = new Array<AuthHandler>();
    auth.forEach((authData) => {
      this.authHandlers.push(CreateAuthHandler(authData, isFromClient));
    });
  };

  static makeJolokiaPrefix = (input: string) => {
    if (!input) {
      return '/console/jolokia/';
    }
    if (!input.startsWith('/')) {
      input = '/' + input;
    }
    if (!input.endsWith('/')) {
      input = input + '/';
    }
    return input;
  };

  static getDefaultPort = (prot: string): string => {
    if (prot === 'https') {
      return '443';
    }
    return '80';
  };

  validateBroker = async (): Promise<boolean> => {
    const result = await this.getComponents(ComponentType.BROKER);
    if (result.length === 1 && result[0].length > 0) {
      //org.apache.activemq.artemis:broker="amq-broker"
      this.brokerName = result[0].split('=', 2)[1];

      //remove quotes
      this.brokerName = this.brokerName.replace(/"/g, '');
      return true;
    }
    return false;
  };

  prepareRequest(reqUrl: string): AuthOptions {
    const headers = new fetch.Headers();
    headers.set('Origin', this.serverUrl);
    const authOpts = {
      headers: headers,
    };
    this.authHandlers.forEach((handler) => {
      handler.handleRequest(reqUrl, authOpts);
    });
    return authOpts;
  }

  getComponents = async (
    compType: ComponentType,
    params?: Map<string, string>,
  ): Promise<Array<string>> => {
    let searchPattern = this.componentMap.get(compType);

    if (typeof params !== 'undefined') {
      for (const [key, value] of params) {
        searchPattern = searchPattern?.replace(key, value);
      }
    }

    searchPattern = searchPattern?.replace('BROKER_NAME', this.brokerName);

    const url = this.baseUrl + 'search/' + searchPattern;

    const { headers, agent } = this.prepareRequest(url);

    const reply = await fetch(url, {
      method: 'GET',
      headers: headers,
      agent: agent ?? false,
    })
      .then((response) => {
        logger.debug(
          { response: response.ok, status: response.statusText },
          'response from endpoint',
        );
        if (response.ok) {
          return response.text();
        }
        throw response;
      })
      .then((message) => {
        const resp: JolokiaResponseType = JSON.parse(message);
        return resp.value;
      });

    return reply;
  };

  readComponentDetails = async (
    compType: ComponentType,
    param?: Map<string, string>,
  ): Promise<JolokiaObjectDetailsType> => {
    let searchPattern = this.componentDetailsMap.get(compType);

    if (param) {
      for (const [key, value] of param) {
        searchPattern = searchPattern?.replace(key, value);
      }
    }
    searchPattern = searchPattern?.replace('BROKER_NAME', this.brokerName);

    const url = this.baseUrl + 'list/' + searchPattern;

    const { headers, agent } = this.prepareRequest(url);

    const reply = await fetch(url, {
      method: 'GET',
      headers: headers,
      agent: agent ?? false,
    })
      .then((response) => {
        if (response.ok) {
          return response.text();
        }
        throw response;
      })
      .then((message) => {
        const resp: JolokiaListResponseType = JSON.parse(message);
        if (resp.status !== 200) {
          throw resp.error;
        }
        return resp.value;
      })
      .catch((err) => {
        throw err;
      });

    return reply;
  };

  execComponentOperation = async (
    compType: ComponentType,
    compName: string,
    param: Map<string, string>,
    signature: string,
    args: string[],
  ): Promise<JolokiaExecResponse> => {
    const { headers, agent } = this.prepareRequest(this.baseUrl);
    headers.set('Content-Type', 'application/json');

    const reply = await fetch(this.baseUrl, {
      method: 'POST',
      headers: headers,
      body: this.getPostBodyForOperation(
        compType,
        compName,
        param,
        signature,
        args,
      ),
      agent: agent ?? false,
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw response;
        }
      })
      .then((jsonObj) => {
        return jsonObj as JolokiaExecResponse;
      })
      .catch((err) => {
        throw err;
      });

    return reply;
  };

  readComponentAttributes = async (
    compType: ComponentType,
    param: Map<string, string>,
    attrNames: string[],
  ): Promise<JolokiaReadResponse[]> => {
    const { headers, agent } = this.prepareRequest(this.baseUrl);
    headers.set('Content-Type', 'application/json');
    const reply = await fetch(this.baseUrl, {
      method: 'POST',
      headers: headers,
      body: this.getPostBodyForAttributes(compType, param, attrNames),
    })
      .then((response) => {
        if (response.ok) {
          return response.text();
        }
        throw response;
      }) //directly use json()?
      .then((message) => {
        const resp: JolokiaReadResponse[] = JSON.parse(message);
        return resp;
      })
      .catch((err) => {
        throw err;
      });
    return reply;
  };

  validateUser = async (): Promise<boolean> => {
    const result = await this.getComponents(ComponentType.BROKER);
    if (result.length === 1) {
      //org.apache.activemq.artemis:broker="amq-broker"
      this.brokerName = result[0].split('=', 2)[1];

      //remove quotes
      this.brokerName = this.brokerName.replace(/"/g, '');
      return true;
    }
    return false;
  };

  getPostBodyForAttributes = (
    compType: ComponentType,
    params?: Map<string, string>,
    attrs?: string[],
  ): string => {
    const bodyItems: JolokiaPostReadBodyItem[] = [];
    let bean = this.componentNameMap.get(compType) as string;
    if (!bean) {
      throw 'undefined bean';
    }
    if (params) {
      for (const [key, value] of params) {
        bean = bean.replace(key, value);
      }
    }
    bean = bean.replace('BROKER_NAME', this.brokerName);
    if (attrs) {
      attrs.map((attr) => {
        bodyItems.push({
          type: 'read',
          mbean: bean,
          attribute: attr,
        });
      });
      return JSON.stringify(bodyItems);
    }
    return JSON.stringify([{ type: 'read', mbean: bean }]);
  };

  getComponentNameKey(compType: ComponentType): string {
    switch (compType) {
      case ComponentType.ACCEPTOR: {
        return 'ACCEPTOR_NAME';
      }
      case ComponentType.ADDRESS: {
        return 'ADDRESS_NAME';
      }
      case ComponentType.BROKER: {
        return '';
      }
      case ComponentType.CLUSTER_CONNECTION: {
        return 'CLUSTER_CONNECTION_NAME';
      }
      case ComponentType.QUEUE: {
        return 'QUEUE_NAME';
      }
      default:
        return '';
    }
  }

  getPostBodyForOperation = (
    compType: ComponentType,
    compName: string,
    params: Map<string, string>,
    signature: string,
    args?: string[],
  ): string => {
    const bodyItems: JolokiaPostExecBodyItem[] = [];
    let bean = this.componentNameMap.get(compType) as string;
    if (!bean) {
      throw 'undefined bean';
    }

    bean = bean.replace('BROKER_NAME', this.brokerName);
    const nameKey = this.getComponentNameKey(compType);
    // nameKey is empty when compType is BROKER
    if (nameKey) {
      bean = bean.replace(nameKey, compName);
    }

    if (params) {
      params.forEach((value, key) => {
        bean = bean.replace(key, value);
      });
    }

    bodyItems.push({
      type: 'exec',
      mbean: bean,
      operation: signature,
      arguments: args ? args : [],
    });

    return JSON.stringify(bodyItems);
  };
}

const validateEndpoint = (endpoint: Endpoint) => {
  if (!endpoint.name) {
    throw Error('No endpoint name');
  }
  if (!endpoint.auth) {
    throw Error('No endpoint authentication data');
  }
  if (!endpoint.url) {
    throw Error('No endpoint url');
  }
};

export const CreateArtemisJolokia = (
  endpoint: Endpoint,
  isFromClient = false,
): ArtemisJolokia => {
  validateEndpoint(endpoint);
  return new ArtemisJolokia(endpoint, isFromClient);
};

interface JolokiaPostReadBodyItem {
  type: string;
  mbean: string;
  attribute?: string;
  path?: string;
}

interface JolokiaPostExecBodyItem {
  type: string;
  mbean: string;
  operation: string;
  arguments?: string[];
}

interface JolokiaRequestType {
  mbean: string;
  type: string;
}

export interface JolokiaResponseType {
  request: JolokiaRequestType;
  value: any;
  timestamp: number;
  status: number;
  error?: string;
  error_type?: string;
}

interface JolokiaListRequestType {
  path: string;
  type: string;
}

type JavaTypes =
  | 'java.lang.Object'
  | 'java.lang.String'
  | 'boolean'
  | 'java.util.Map'
  | 'int'
  | 'long'
  | 'double'
  | 'void';

interface Argument {
  name: string;
  type: JavaTypes;
  desc: string;
}

export interface Op {
  args: Argument[];
  ret?: JavaTypes;
  desc: string;
}

export interface Attr {
  rw: boolean;
  type: JavaTypes;
  desc: string;
}

export interface JolokiaObjectDetailsType {
  op: { [key: string]: Op | Op[] };
  attr: { [key: string]: Attr };
  class: string;
  desc: string;
}

interface JolokiaListResponseType {
  request: JolokiaListRequestType;
  value: JolokiaObjectDetailsType;
  timestamp: number;
  status: number;
  error?: string;
  error_type?: string;
}

export interface JolokiaReadResponse {
  request: JolokiaRequestType;
  value: Map<string, any>;
  timestamp: number;
  status: number;
  error?: string;
  error_type?: string;
}

export interface JolokiaExecResponse {
  request: JolokiaRequestType;
  value: any;
  timestamp: number;
  status: number;
  error?: string;
  error_type?: string;
}
