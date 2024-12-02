import yaml from 'js-yaml';
import { EndpointList } from '../../utils/security_util';
import fs from 'fs';
import {
  ArtemisJolokia,
  CreateArtemisJolokia,
} from '../apiutil/artemis_jolokia';
import { logger } from '../../utils/logger';

export class EndpointManager {
  // endpoint name => endpoint
  endpointsMap: Map<string, ArtemisJolokia>;

  start = async () => {
    this.endpointsMap = EndpointManager.loadEndpoints(
      process.env.USERS_FILE_URL
        ? process.env.ENDPOINTS_FILE_URL
        : '.endpoints.json',
    );
  };

  static loadEndpoints = (fileUrl: string): Map<string, ArtemisJolokia> => {
    const endpointsMap = new Map<string, ArtemisJolokia>();
    if (fs.existsSync(fileUrl)) {
      const fileContents = fs.readFileSync(fileUrl, 'utf8');
      const data = yaml.load(fileContents) as EndpointList;
      data?.endpoints?.forEach((endpoint) => {
        try {
          const jolokia = CreateArtemisJolokia(endpoint);
          // it supports query on either name or url
          endpointsMap.set(endpoint.name, jolokia);
          endpointsMap.set(endpoint.url, jolokia);
        } catch (err) {
          logger.warn(
            err,
            'failed to load endpoint (make sure your endpoint config is correct)',
          );
        }
      });
    }
    return endpointsMap;
  };

  listEndpoints = async (): Promise<ArtemisJolokia[]> => {
    const endpoints = new Map<string, ArtemisJolokia>();
    this.endpointsMap.forEach((value) => {
      if (!endpoints.has(value.name)) {
        endpoints.set(value.name, value);
      }
    });
    return Array.from(endpoints.values());
  };

  getJolokia = (targetEndpoint: string): ArtemisJolokia => {
    const endpoint = this.endpointsMap.get(targetEndpoint);
    if (endpoint) {
      return endpoint;
    }
    throw Error('no endpoint found');
  };
}

const endpointManager = new EndpointManager();

export const InitEndpoints = async () => {
  endpointManager.start();
};

export const GetEndpointManager = (): EndpointManager => {
  return endpointManager;
};
