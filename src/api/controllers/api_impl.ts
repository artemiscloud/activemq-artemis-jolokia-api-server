import * as express from 'express';
import {
  ArtemisJolokia,
  ComponentType,
  JolokiaExecResponse,
  JolokiaObjectDetailsType,
  JolokiaReadResponse,
} from '../apiutil/artemis_jolokia';
import { API_SUMMARY } from '../../utils/server';
import { GetEndpointManager } from './endpoint_manager';
import { IsSecurityEnabled } from './security_manager';
import { logger } from '../../utils/logger';

const BROKER = 'broker';
const ADDRESS = 'address';
const QUEUE = 'queue';
const ROUTING_TYPE = 'routing-type';

const parseProps = (rawProps: string): Map<string, string> => {
  const props = rawProps.split(':')[1];
  const map = new Map<string, string>();
  props.split(',').forEach((entry) => {
    const [key, value] = entry.split('=');
    map.set(key, value.replace(new RegExp('"', 'g'), ''));
  });
  return map;
};

export const listEndpoints = (
  _: express.Request,
  res: express.Response,
): void => {
  try {
    GetEndpointManager()
      .listEndpoints()
      .then((result) => {
        res.json(
          result.map((entry) => {
            return {
              name: entry.name,
              url: entry.serverUrl,
            };
          }),
        );
      })
      .catch((err: any) => {
        res.status(500).json({
          status: 'error',
          message: 'server error ' + JSON.stringify(err),
        });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getBrokers = (_: express.Request, res: express.Response): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const comps = jolokia.getComponents(ComponentType.BROKER);

    comps
      .then((result: any[]) => {
        res.json(
          result.map((entry: string) => {
            const props = parseProps(entry);
            return {
              name: props.get(BROKER),
            };
          }),
        );
      })
      .catch((err: any) => {
        logger.debug(err, 'error getting BROKER comp');
        res.status(500).json({
          status: 'error',
          message: 'server error ' + JSON.stringify(err),
        });
      });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getClusterConnections = (
  _: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const comps = jolokia.getComponents(ComponentType.CLUSTER_CONNECTION);

    comps
      .then((result: any[]) => {
        res.json(
          result.map((entry: string) => {
            const props = parseProps(entry);
            const clusterConnection = {
              name: props.get('name'),
              broker: {
                name: props.get(BROKER),
              },
            };
            return clusterConnection;
          }),
        );
      })
      .catch((error: any) => {
        logger.error(error);
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const readClusterConnectionAttributes = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;
    const clusterConnectionName = req.query.name as string;
    const clusterConnectionAttrNames = req.query.attrs as string[];

    const param = new Map<string, string>();
    param.set('CLUSTER_CONNECTION_NAME', clusterConnectionName);

    const attributes = jolokia.readComponentAttributes(
      ComponentType.CLUSTER_CONNECTION,
      param,
      clusterConnectionAttrNames,
    );

    attributes
      .then((result: JolokiaReadResponse[]) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getClusterConnectionDetails = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const clusterConnectionName = req.query.name;

    const param = new Map<string, string>();
    param.set('CLUSTER_CONNECTION_NAME', <string>clusterConnectionName);

    const compDetails = jolokia.readComponentDetails(
      ComponentType.CLUSTER_CONNECTION,
      param,
    );

    compDetails
      .then((result: JolokiaObjectDetailsType) => {
        Object.entries(result.op).forEach(([key, value]) => {
          if (!Array.isArray(value)) {
            result.op[key] = [value];
          }
        });
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const execClusterConnectionOperation = (
  req: express.Request,
  res: express.Response,
): void => {
  req.query.type = ComponentType.CLUSTER_CONNECTION;
  execMBeanOperation(req, res);
};

export const getAcceptors = (
  _: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const comps = jolokia.getComponents(ComponentType.ACCEPTOR);

    comps
      .then((result: any[]) => {
        res.json(
          result.map((entry: string) => {
            const props = parseProps(entry);
            const acceptor = {
              name: props.get('name'),
              broker: {
                name: props.get(BROKER),
              },
            };
            return acceptor;
          }),
        );
      })
      .catch((error: any) => {
        logger.error(error);
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const readAcceptorAttributes = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;
    const acceptorName = req.query.name as string;
    const acceptorAttrNames = req.query.attrs as string[];

    const param = new Map<string, string>();
    param.set('ACCEPTOR_NAME', acceptorName);

    const attributes = jolokia.readComponentAttributes(
      ComponentType.ACCEPTOR,
      param,
      acceptorAttrNames,
    );

    attributes
      .then((result: JolokiaReadResponse[]) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getBrokerComponents = (
  _: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const comps = jolokia.getComponents(ComponentType.ALL);

    comps
      .then((result: any[]) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getAddresses = (
  _: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const comps = jolokia.getComponents(ComponentType.ADDRESS);
    comps
      .then((result: any[]) => {
        res.json(
          result.map((entry: string) => {
            const props = parseProps(entry);
            const address = {
              name: props.get(ADDRESS),
              broker: {
                name: props.get(BROKER),
              },
            };
            return address;
          }),
        );
      })
      .catch((error: any) => {
        logger.error(error);
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const readAddressAttributes = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;
    const addressName = req.query.name as string;
    const addressAttrNames = req.query.attrs as string[];

    const param = new Map<string, string>();
    param.set('ADDRESS_NAME', addressName);

    const attributes = jolokia.readComponentAttributes(
      ComponentType.ADDRESS,
      param,
      addressAttrNames,
    );

    attributes
      .then((result: JolokiaReadResponse[]) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getQueues = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const addressName = req.query.address || '*';

    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const param = new Map<string, string>();
    const name = <string>addressName;
    param.set('ADDRESS_NAME', name);
    const comps = jolokia.getComponents(ComponentType.QUEUE, param);

    comps
      .then((result: any[]) => {
        res.json(
          result.map((entry: string) => {
            const props = parseProps(entry);
            const queue = {
              name: props.get(QUEUE),
              'routing-type': props.get(ROUTING_TYPE),
              address: {
                name: props.get(ADDRESS),
                broker: {
                  name: props.get(BROKER),
                },
              },
              broker: {
                name: props.get(BROKER),
              },
            };
            return queue;
          }),
        );
      })
      .catch((error: any) => {
        logger.error(error);
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const readQueueAttributes = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;
    const queueName = req.query.name as string;
    const routingType = req.query['routing-type'] as string;
    const addressName = req.query.address as string;
    const queueAttrNames = req.query.attrs as string[];

    const param = new Map<string, string>();
    param.set('QUEUE_NAME', queueName);
    param.set('ROUTING_TYPE', routingType);
    param.set('ADDRESS_NAME', addressName);

    const attributes = jolokia.readComponentAttributes(
      ComponentType.QUEUE,
      param,
      queueAttrNames,
    );

    attributes
      .then((result: JolokiaReadResponse[]) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getBrokerDetails = (
  _: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const compDetails = jolokia.readComponentDetails(
      ComponentType.BROKER,
      null,
    );

    compDetails
      .then((result: JolokiaObjectDetailsType) => {
        Object.entries(result.op).forEach(([key, value]) => {
          if (!Array.isArray(value)) {
            result.op[key] = [value];
          }
        });
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

type OperationRef = {
  signature: {
    name: string;
    args: Array<OperationArgument>;
  };
};
type OperationArgument = {
  type: JavaTypes;
  value: string;
};
enum JavaTypes {
  JAVA_LANG_STRING = 'java.lang.String',
  BOOLEAN = 'boolean',
  JAVA_UTIL_MAP = 'java.util.Map',
  INT = 'int',
  LONG = 'long',
  DOUBLE = 'double',
  VOID = 'void',
}
export const execBrokerOperation = (
  req: express.Request,
  res: express.Response,
): void => {
  const jolokia = res.locals.jolokia as ArtemisJolokia;
  req.query.type = ComponentType.BROKER;
  req.query.name = jolokia.brokerName;
  execMBeanOperation(req, res);
};

export const readBrokerAttributes = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;
    const brokerAttrNames = req.query.names as string[];

    const attributes = jolokia.readComponentAttributes(
      ComponentType.BROKER,
      null,
      brokerAttrNames,
    );

    attributes
      .then((result: JolokiaReadResponse[]) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getAddressDetails = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const addressName = req.query.name;

    const param = new Map<string, string>();
    param.set('ADDRESS_NAME', <string>addressName);

    const compDetails = jolokia.readComponentDetails(
      ComponentType.ADDRESS,
      param,
    );

    compDetails
      .then((result: JolokiaObjectDetailsType) => {
        Object.entries(result.op).forEach(([key, value]) => {
          if (!Array.isArray(value)) {
            result.op[key] = [value];
          }
        });
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getAcceptorDetails = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const acceptorName = req.query.name;

    const param = new Map<string, string>();
    param.set('ACCEPTOR_NAME', <string>acceptorName);

    const compDetails = jolokia.readComponentDetails(
      ComponentType.ACCEPTOR,
      param,
    );

    compDetails
      .then((result: JolokiaObjectDetailsType) => {
        Object.entries(result.op).forEach(([key, value]) => {
          if (!Array.isArray(value)) {
            result.op[key] = [value];
          }
        });
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const getQueueDetails = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const queueName = req.query.name;
    const addressName = req.query.addressName
      ? req.query.addressName
      : queueName;
    const routingType = req.query.routingType;

    const param = new Map<string, string>();
    param.set('ADDRESS_NAME', <string>addressName);
    param.set('QUEUE_NAME', <string>queueName);
    param.set('ROUTING_TYPE', <string>routingType);

    const compDetails = jolokia.readComponentDetails(
      ComponentType.QUEUE,
      param,
    );

    compDetails
      .then((result: JolokiaObjectDetailsType) => {
        Object.entries(result.op).forEach(([key, value]) => {
          if (!Array.isArray(value)) {
            result.op[key] = [value];
          }
        });
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const execMBeanOperation = (
  req: express.Request,
  res: express.Response,
): void => {
  try {
    const jolokia = res.locals.jolokia as ArtemisJolokia;

    const operationRef = req.body as OperationRef;
    const strArgs: string[] = [];
    let strSignature = operationRef.signature.name + '(';
    operationRef.signature.args.forEach((arg, item, array) => {
      strSignature = strSignature + arg.type;
      if (item < array.length - 1) {
        strSignature = strSignature + ',';
      }
      strArgs.push(arg.value);
    });
    strSignature = strSignature + ')';

    const compType = req.query.type as ComponentType;
    const compName = req.query.name as string;

    //name1=value,name2=value...
    const extrArgs = req.query.extrArgs as string;
    const param = new Map<string, string>();
    if (extrArgs) {
      const valueKeyPairs = extrArgs.split(',');
      valueKeyPairs.forEach((value) => {
        const pair = value.split('=');
        if (pair.length === 2) {
          param.set(pair[0], pair[1]);
        } else {
          throw Error('invalid extra arg: ' + value);
        }
      });
    }

    const resp = jolokia.execComponentOperation(
      compType,
      compName,
      param,
      strSignature,
      strArgs,
    );
    resp
      .then((result: JolokiaExecResponse) => {
        res.json(result);
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ status: 'error', message: 'server error' });
      });
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      status: 'error',
      message: 'server error: ' + JSON.stringify(err),
    });
  }
};

export const apiInfo = (_: express.Request, res: express.Response): void => {
  res.json({
    security: {
      enabled: IsSecurityEnabled(),
    },
    message: API_SUMMARY,
    status: 'successful',
  });
};

export const checkCredentials = (
  _: express.Request,
  res: express.Response,
): void => {
  res.json({
    message: 'ok',
    status: 'successful',
  });
};
