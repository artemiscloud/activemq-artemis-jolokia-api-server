import { ApiClient } from './api-client';
import { LocalJolokiaEndpoint } from './context';

class JolokiaClient extends ApiClient {
  PrepareFetchUrl(path: string) {
    return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, '/'));
  }
}

export class ServerAccess {
  apiClient: JolokiaClient;
  currentUser: string;

  constructor(apiServerUrl: string) {
    this.apiClient = new JolokiaClient({
      baseUrl: apiServerUrl + '/api/v1/',
    });
  }

  setLoginUser(userName: string) {
    this.currentUser = userName;
  }

  login = async (currentEndpoint: LocalJolokiaEndpoint) => {
    return this.apiClient.security.login(currentEndpoint);
  };

  checkApiServer = async (): Promise<boolean> => {
    return this.apiClient.development
      .apiInfo()
      .then((value) => {
        if (value.status === 'successful') {
          return true;
        }
        return false;
      })
      .catch(() => {
        return false;
      });
  };

  updateClientHeader = (name: string, accessToken: string) => {
    this.apiClient.Config.headers = {
      ...this.apiClient.Config.headers,
      [name]: accessToken,
    };
  };

  updateBearerToken(bearerToken: string) {
    this.apiClient.Config.headers = {
      ...this.apiClient.Config.headers,
      Authorization: 'Bearer ' + bearerToken,
    };
  }

  loginServer = async (userName: string, password: string) => {
    return this.apiClient.security.serverLogin({ userName, password });
  };

  getTargetOpts = (remoteTarget: string) => {
    return remoteTarget ? { targetEndpoint: remoteTarget } : {};
  };

  getBrokerComponents = async (remoteTarget: string) => {
    return this.apiClient.jolokia.getBrokerComponents(
      this.getTargetOpts(remoteTarget),
    );
  };

  getQueues = async (remoteTarget: string) => {
    return this.apiClient.jolokia.getQueues(this.getTargetOpts(remoteTarget));
  };

  getAddresses = async (remoteTarget: string) => {
    return this.apiClient.jolokia.getAddresses(
      this.getTargetOpts(remoteTarget),
    );
  };

  getAcceptors = async (remoteTarget: string) => {
    return this.apiClient.jolokia.getAcceptors(
      this.getTargetOpts(remoteTarget),
    );
  };

  getClusterConnections = async (remoteTarget: string) => {
    return this.apiClient.jolokia.getClusterConnections(
      this.getTargetOpts(remoteTarget),
    );
  };

  readBrokerAttributes = async (
    remoteTarget: string,
    opts: { names?: undefined } | { names: string[] },
  ) => {
    return this.apiClient.jolokia.readBrokerAttributes({
      ...opts,
      ...this.getTargetOpts(remoteTarget),
    });
  };

  readBrokerOperations = async (remoteTarget: string) => {
    return this.apiClient.jolokia.getBrokerDetails({
      ...this.getTargetOpts(remoteTarget),
    });
  };

  readQueueAttributes = async (
    remoteTarget: string,
    opts:
      | {
          name: string;
          address: string;
          'routing-type': string;
          attrs?: undefined;
        }
      | {
          name: string;
          address: string;
          'routing-type': string;
          attrs: string[];
        },
  ) => {
    return this.apiClient.jolokia.readQueueAttributes({
      ...opts,
      ...this.getTargetOpts(remoteTarget),
    });
  };

  readAddressAttributes = async (
    remoteTarget: string,
    opts:
      | { name: string; attrs?: undefined }
      | { name: string; attrs: string[] },
  ) => {
    return this.apiClient.jolokia.readAddressAttributes({
      ...opts,
      ...this.getTargetOpts(remoteTarget),
    });
  };

  readAcceptorAttributes = async (
    remoteTarget: string,
    opts:
      | { name: string; attrs?: undefined }
      | { name: string; attrs: string[] },
  ) => {
    return this.apiClient.jolokia.readAcceptorAttributes({
      ...opts,
      ...this.getTargetOpts(remoteTarget),
    });
  };

  readClusterConnectionAttributes = async (
    remoteTarget: string,
    opts:
      | { name: string; attrs?: undefined }
      | { name: string; attrs: string[] },
  ) => {
    return this.apiClient.jolokia.readClusterConnectionAttributes({
      ...opts,
      ...this.getTargetOpts(remoteTarget),
    });
  };

  getBrokers = async (remoteEndpoint: string) => {
    return this.apiClient.jolokia.getBrokers(
      this.getTargetOpts(remoteEndpoint),
    );
  };

  listEndpoints = async () => {
    return this.apiClient.admin.listEndpoints();
  };
}
