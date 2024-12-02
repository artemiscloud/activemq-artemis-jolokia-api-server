import https from 'https';
import fs from 'fs';
import path from 'path';
import createServer from './server';
import nock from 'nock';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { InitLoggers, logger } from './logger';
import {
  GetSecurityManager,
  IsSecurityEnabled,
  LocalSecurityStore,
} from '../api/controllers/security_manager';
import {
  EndpointManager,
  GetEndpointManager,
} from '../api/controllers/endpoint_manager';
import {
  BasicAuthHandler,
  decryptPassword,
  encryptPassword,
  UserList,
} from './security_util';

/* eslint no-async-promise-executor: 0 */

dotenv.config({ path: '.test.env' });

let testServer: https.Server;
let mockJolokia: nock.Scope;

let mockBroker1: nock.Scope;

const apiUrlBase = 'https://localhost:9444/api/v1';
const apiUrlPrefix = '/console/jolokia';
const loginUrl = apiUrlBase + '/jolokia/login';
const serverLoginUrl = apiUrlBase + '/server/login';
const jolokiaProtocol = 'https';
const jolokiaHost = 'broker-0-jolokia.test.com';
const jolokiaPort = '8161';
const jolokiaSessionKey = 'jolokia-session-id';

// see .test.endpoints.json
const broker1EndpointUrl = 'http://127.0.0.1:8161';

const startApiServer = async (): Promise<boolean> => {
  process.env.API_SERVER_SECURITY_ENABLED = 'true';

  const enableRequestLog = process.env.ENABLE_REQUEST_LOG === 'true';
  InitLoggers();

  const result = await createServer(enableRequestLog)
    .then((server) => {
      const options = {
        key: fs.readFileSync(path.join(__dirname, '../config/domain.key')),
        cert: fs.readFileSync(path.join(__dirname, '../config/domain.crt')),
      };
      testServer = https.createServer(options, server);
      testServer.listen(9444, () => {
        logger.info('Listening on https://0.0.0.0:9444');
        logger.info(
          'Security is ' + (IsSecurityEnabled() ? 'enabled' : 'disabled'),
        );
      });
      return true;
    })
    .catch((err) => {
      console.log('error starting server', err);
      return false;
    });
  return result;
};

const stopApiServer = () => {
  testServer.close();
};

const startMockJolokia = () => {
  mockJolokia = nock(jolokiaProtocol + '://' + jolokiaHost + ':' + jolokiaPort);
  mockBroker1 = nock(broker1EndpointUrl);
};

const stopMockJolokia = () => {
  nock.cleanAll();
};

beforeAll(async () => {
  const result = await startApiServer();
  expect(result).toBe(true);
  expect(testServer).toBeDefined();
  startMockJolokia();
});

afterAll(() => {
  stopApiServer();
  stopMockJolokia();
});

const doGet = async (
  url: string,
  token: string | null,
  authToken: string,
): Promise<fetch.Response> => {
  const fullUrl = apiUrlBase + url;
  const encodedUrl = fullUrl.replace(/,/g, '%2C');

  if (token) {
    const response = await fetch(encodedUrl, {
      method: 'GET',
      headers: {
        [jolokiaSessionKey]: token,
        Authorization: 'Bearer ' + authToken,
      },
    });
    return response;
  }

  const response = await fetch(encodedUrl, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + authToken,
    },
  });
  return response;
};

const doPost = async (
  url: string,
  postBody: fetch.BodyInit,
  token: string | null,
  authToken: string,
): Promise<fetch.Response> => {
  const fullUrl = apiUrlBase + url;
  const encodedUrl = fullUrl.replace(/,/g, '%2C');

  if (token) {
    const reply = await fetch(encodedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [jolokiaSessionKey]: token,
        Authorization: 'Bearer ' + authToken,
      },
      body: postBody,
    });

    return reply;
  }
  const reply = await fetch(encodedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + authToken,
    },
    body: postBody,
  });

  return reply;
};

type LoginOptions = {
  [key: string]: string;
};

type LoginResult = {
  resp: fetch.Response;
  accessToken: string | null;
  authToken: string;
};

const doServerLogin = async (
  user: string,
  pass: string,
): Promise<LoginResult> => {
  const details: LoginOptions = {
    userName: user,
    password: pass,
  };

  const formBody: string[] = [];
  for (const property in details) {
    const encodedKey = encodeURIComponent(property);
    const encodedValue = encodeURIComponent(details[property]);
    formBody.push(encodedKey + '=' + encodedValue);
  }
  const formData = formBody.join('&');

  const response = await fetch(serverLoginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  const obj = await response.json();

  const bearerToken = obj.bearerToken;

  return {
    resp: response,
    accessToken: null,
    authToken: bearerToken as string,
  };
};

const doJolokiaLoginWithAuth = async (
  user: string,
  pass: string,
): Promise<LoginResult> => {
  return doServerLogin(user, pass).then(async (result) => {
    if (!result.resp.ok) {
      throw Error('failed server login');
    }

    const jolokiaResp = {
      request: {},
      value: ['org.apache.activemq.artemis:broker="amq-broker"'],
      timestamp: 1714703745,
      status: 200,
    };
    mockJolokia
      .get(apiUrlPrefix + '/search/org.apache.activemq.artemis:broker=*')
      .reply(200, JSON.stringify(jolokiaResp));

    const details: LoginOptions = {
      brokerName: 'ex-aao-0',
      userName: 'admin',
      password: 'admin',
      jolokiaHost: jolokiaHost,
      port: jolokiaPort,
      scheme: jolokiaProtocol,
    };

    const formBody: string[] = [];
    for (const property in details) {
      const encodedKey = encodeURIComponent(property);
      const encodedValue = encodeURIComponent(details[property]);
      formBody.push(encodedKey + '=' + encodedValue);
    }
    const formData = formBody.join('&');

    const res1 = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Bearer ' + result.authToken,
      },
      body: formData,
    });

    const data = await res1.json();

    return {
      resp: res1,
      accessToken: data[jolokiaSessionKey] as string,
      authToken: result.authToken,
    };
  });
};

describe('test api server login with jolokia login', () => {
  it('test login functionality', async () => {
    const result = await doJolokiaLoginWithAuth('user1', 'password');

    expect(result.resp.ok).toBeTruthy();

    expect(result?.accessToken?.length).toBeGreaterThan(0);
    expect(result.authToken.length).toBeGreaterThan(0);
  });

  it('test jolokia login failure', async () => {
    const jolokiaResp = {
      request: {},
      value: [''],
      error: 'forbidden access',
      timestamp: 1714703745,
      status: 403,
    };
    mockJolokia
      .get(apiUrlPrefix + '/search/org.apache.activemq.artemis:broker=*')
      .reply(403, JSON.stringify(jolokiaResp));

    const result = await doJolokiaLoginWithAuth('user1', 'password');

    expect(result.resp.ok).toBeFalsy();
  });

  it('test server login failure wrong user or password', async () => {
    const result = await doServerLogin('nouser', 'password');
    expect(result.resp.ok).toBeFalsy();

    const result1 = await doServerLogin('nouser', 'nopassword');
    expect(result1.resp.ok).toBeFalsy();

    const result2 = await doServerLogin('user1', 'password2');
    expect(result2.resp.ok).toBeFalsy();
  });
});

describe('test direct proxy access', () => {
  let accessToken: string;
  let jwtToken: string;

  beforeAll(async () => {
    const result = await doJolokiaLoginWithAuth('user1', 'password');
    jwtToken = result.authToken;
    expect(result?.accessToken?.length).toBeGreaterThan(0);
    accessToken = result.accessToken as string;
    expect(jwtToken.length).toBeGreaterThan(0);
  });

  it('test get brokers', async () => {
    const result = [
      {
        name: 'amq-broker',
      },
    ];
    const jolokiaResp = {
      request: {},
      value: ['org.apache.activemq.artemis:broker="amq-broker"'],
      timestamp: 1714703745,
      status: 200,
    };
    mockJolokia
      .get(apiUrlPrefix + '/search/org.apache.activemq.artemis:broker=*')
      .reply(200, JSON.stringify(jolokiaResp));

    const resp = await doGet('/brokers', accessToken, jwtToken);
    expect(resp.ok).toBeTruthy();

    const value = await resp.json();
    expect(value.length).toEqual(1);
    expect(value[0]).toEqual(result[0]);
  });
});

describe('test endpoints loading', () => {
  let jwtToken: string;

  beforeAll(async () => {
    const result = await doServerLogin('root', 'password');
    jwtToken = result.authToken;
    expect(result.accessToken).toBeNull();
    expect(jwtToken.length).toBeGreaterThan(0);
  });

  it('check endpoints are loaded', () => {
    const endpointManager = GetEndpointManager();
    expect(endpointManager.endpointsMap.size).toEqual(8);

    const jolokia1 = endpointManager.getJolokia('broker1');
    const jolokia1ByUrl = endpointManager.getJolokia('http://127.0.0.1:8161');
    expect(jolokia1).toEqual(jolokia1ByUrl);
    expect(jolokia1).not.toBeUndefined();
    expect(jolokia1?.baseUrl).toEqual('http://127.0.0.1:8161/console/jolokia/');

    const jolokia2 = endpointManager.getJolokia('broker2');
    const jolokia2ByUrl = endpointManager.getJolokia('http://127.0.0.2:8161');
    expect(jolokia2).toEqual(jolokia2ByUrl);
    expect(jolokia2).not.toBeUndefined();
    expect(jolokia2?.baseUrl).toEqual('http://127.0.0.2:8161/console/jolokia/');

    const jolokia3 = endpointManager.getJolokia('broker3');
    const jolokia3ByUrl = endpointManager.getJolokia('http://127.0.0.3:8161');
    expect(jolokia3).toEqual(jolokia3ByUrl);
    expect(jolokia3).not.toBeUndefined();
    expect(jolokia3?.baseUrl).toEqual('http://127.0.0.3:8161/console/jolokia/');

    const jolokia4 = endpointManager.getJolokia('broker4');
    const jolokia4ByUrl = endpointManager.getJolokia(
      'https://artemis-broker-jolokia-0-svc-ing-default.artemiscloud.io:443',
    );
    expect(jolokia4).toEqual(jolokia4ByUrl);
    expect(jolokia4).not.toBeUndefined();
    expect(jolokia4?.baseUrl).toEqual(
      'https://artemis-broker-jolokia-0-svc-ing-default.artemiscloud.io:443/jolokia/',
    );
  });

  it('check list endpoints', async () => {
    const endpointManager = GetEndpointManager();
    const endpoints = await endpointManager.listEndpoints();
    expect(endpoints.length).toEqual(4);

    let [broker1Found, broker2Found, broker3Found, broker4Found] = [
      false,
      false,
      false,
      false,
    ];
    endpoints.forEach((e) => {
      switch (e.name) {
        case 'broker1': {
          expect(e.baseUrl).toEqual('http://127.0.0.1:8161/console/jolokia/');
          broker1Found = true;
          break;
        }
        case 'broker2': {
          expect(e.baseUrl).toEqual('http://127.0.0.2:8161/console/jolokia/');
          broker2Found = true;
          break;
        }
        case 'broker3': {
          expect(e.baseUrl).toEqual('http://127.0.0.3:8161/console/jolokia/');
          broker3Found = true;
          break;
        }
        case 'broker4': {
          expect(e.baseUrl).toEqual(
            'https://artemis-broker-jolokia-0-svc-ing-default.artemiscloud.io:443/jolokia/',
          );
          broker4Found = true;
          break;
        }
        default: {
          throw Error('invalid broker name: ' + e.brokerName);
        }
      }
    });
    expect(broker1Found).toBeTruthy();
    expect(broker2Found).toBeTruthy();
    expect(broker3Found).toBeTruthy();
    expect(broker4Found).toBeTruthy();
  });
});

describe('check security manager', () => {
  const securityManager = GetSecurityManager();
  const securityStore = securityManager.getSecurityStore();

  it('check user role mapping', () => {
    const users = securityStore.getAllUsers();
    expect(users.size).toEqual(5);
    expect(users.has('user1')).toBeTruthy();
    expect(users.has('user2')).toBeTruthy();
    expect(users.has('root')).toBeTruthy();
    expect(users.has('usernoroles')).toBeTruthy();
    expect(users.has('admin')).toBeTruthy();
  });
});

describe('test endpoint access with successful auth', () => {
  let jwtToken: string;

  beforeAll(async () => {
    const result = await doServerLogin('user1', 'password');
    jwtToken = result.authToken;
    expect(result.accessToken).toBeNull();
    expect(jwtToken.length).toBeGreaterThan(0);
  });

  it('test get brokers', async () => {
    const result = [
      {
        name: 'amq-broker1',
      },
    ];

    const jolokiaResp1 = {
      request: {},
      value: ['org.apache.activemq.artemis:broker="amq-broker1"'],
      timestamp: 1714703745,
      status: 200,
    };

    //use persist when this path will get called more than once.
    mockBroker1
      .persist()
      .get(apiUrlPrefix + '/search/org.apache.activemq.artemis:broker=*')
      .reply(200, JSON.stringify(jolokiaResp1));

    const resp = await doGet('/brokers?targetEndpoint=broker1', null, jwtToken);

    expect(resp.ok).toBeTruthy();

    const value = await resp.json();
    expect(value.length).toEqual(1);
    expect(value[0]).toEqual(result[0]);
  });

  it('test execBrokerOperation', async () => {
    const jolokiaGetResp = {
      request: {},
      value: ['org.apache.activemq.artemis:broker="amq-broker1"'],
      timestamp: 1714703745,
      status: 200,
    };

    //use persist when this path will get called more than once.
    mockBroker1
      .persist()
      .get(apiUrlPrefix + '/search/org.apache.activemq.artemis:broker=*')
      .reply(200, JSON.stringify(jolokiaGetResp));

    const jolokiaResp = [
      {
        request: {
          mbean: 'org.apache.activemq.artemis:broker="amq-broker1"',
          arguments: [','],
          type: 'exec',
          operation: 'listAddresses(java.lang.String)',
        },
        value:
          '$.artemis.internal.sf.my-cluster.5c0e3e93-1837-11ef-aa70-0a580ad9005f,activemq.notifications,DLQ,ExpiryQueue',
        timestamp: 1716385483,
        status: 200,
      },
    ];

    mockBroker1
      .post(apiUrlPrefix + '/', (body) => {
        if (
          body.length === 1 &&
          body[0].type === 'exec' &&
          body[0].mbean ===
            'org.apache.activemq.artemis:broker="amq-broker1"' &&
          body[0].operation === 'listAddresses(java.lang.String)' &&
          body[0].arguments[0] === ','
        ) {
          return true;
        }
        return false;
      })
      .reply(200, JSON.stringify(jolokiaResp));

    const resp = await doPost(
      '/execBrokerOperation?targetEndpoint=broker1',
      JSON.stringify({
        signature: {
          name: 'listAddresses',
          args: [{ type: 'java.lang.String', value: ',' }],
        },
      }),
      null,
      jwtToken,
    );
    expect(resp.ok).toBeTruthy();

    const value = await resp.json();
    expect(JSON.stringify(value)).toEqual(JSON.stringify(jolokiaResp));
  });
});

describe('local user store test', () => {
  const newUsersFile = '.new.users.json';
  const userList: UserList = { users: [] };
  const userId1 = 'newuser1';
  const hash1 = 'blblksjkdlafjldfja';

  const localStore = new LocalSecurityStore();

  beforeAll(async () => {
    process.env.USERS_FILE_URL = newUsersFile;
    userList.users.push({ id: userId1, hash: hash1 });
    fs.appendFileSync(newUsersFile, JSON.stringify(userList));

    await localStore.start();
  });

  afterAll((done) => {
    process.env.USERS_FILE_URL = undefined;
    fs.unlinkSync(newUsersFile);
    done();
  });

  it('test user loading', async () => {
    const found = await localStore.findUser(userId1);
    expect(found).not.toBe(null);
    expect(found.id).toEqual(userId1);
    expect(found.hash).toEqual(hash1);

    const hash2 = 'kjdfljsldjflsjfdlsd';
    const userId2 = 'newuser2';
    const hash3 = 'kjffdjjnjkdjfkjjjjj';

    // update first user's hash
    userList.users[0].hash = hash2;
    // add a new user
    userList.users.push({ id: userId2, hash: hash3 });

    fs.writeFileSync(newUsersFile, JSON.stringify(userList));

    await waitForResult(200, 10, async () => {
      try {
        const user1 = await localStore.findUser(userId1);
        if (user1.id !== userId1) {
          return false;
        }
        if (user1.hash !== hash2) {
          return false;
        }
        const user2 = await localStore.findUser(userId2);
        if (user2.id !== userId2) {
          return false;
        }
        if (user2.hash !== hash3) {
          return false;
        }
      } catch (err) {
        return false;
      }
      return true;
    });
  });
});

describe('encryption and decryption test', () => {
  it('test password encryption and decryption', async () => {
    const jolokiaPassword = 'A27NiUSJwKYBgH0g';
    const alg = 'aes-256-cbc';
    const { masked, key } = encryptPassword(
      jolokiaPassword,
      alg,
      BasicAuthHandler.DEFAULT_ENC_PASSWORD,
    );
    const decrypted = decryptPassword(masked, alg, key);
    expect(decrypted).toEqual(jolokiaPassword);
    // test values
    const endpointManager = new EndpointManager();
    endpointManager.start();
    const jolokia1 = endpointManager.getJolokia('broker1');
    const jolokia1ByUrl = endpointManager.getJolokia('http://127.0.0.1:8161');
    expect(jolokia1).toEqual(jolokia1ByUrl);
    const basic1 = jolokia1?.authHandlers[0] as BasicAuthHandler;
    const decrypted1 = decryptPassword(
      basic1.basicAuth.password,
      basic1.alg,
      basic1.encryptKey,
    );
    expect(decrypted1).toEqual('guest');
    const jolokia2 = endpointManager.endpointsMap.get('broker2');
    const basic2 = jolokia2?.authHandlers[0] as BasicAuthHandler;
    const decrypted2 = decryptPassword(
      basic2.basicAuth.password,
      basic2.alg,
      basic2.encryptKey,
    );
    expect(decrypted2).toEqual('guest');
    const jolokia3 = endpointManager.endpointsMap.get('broker3');
    const basic3 = jolokia3?.authHandlers[0] as BasicAuthHandler;
    const decrypted3 = decryptPassword(
      basic3.basicAuth.password,
      basic3.alg,
      basic3.encryptKey,
    );
    expect(decrypted3).toEqual('admin');
  });
});

// this method calls checkFunc until it returns true or exceeds the number of retry
// interval: delay on each retry
// retry: max number of retries
const waitForResult = async (
  interval: number,
  retry: number,
  checkFunc: () => Promise<boolean>,
) => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let count = 1;

  return new Promise(async (resolve, reject) => {
    while (count < retry) {
      await sleep(interval);

      try {
        const result = await checkFunc();
        if (result) {
          resolve(true);
        } else {
          count++;
        }
      } catch (e) {
        console.log('got error', e);
        count++;
      }
    }
    reject(new Error(`time out waiting: ${count} attempts tried`));
  });
};
