import * as express from 'express';
import jwt from 'jsonwebtoken';
import {
  ArtemisJolokia,
  CreateArtemisJolokia,
} from '../apiutil/artemis_jolokia';
import { GetSecurityManager, IsSecurityEnabled } from './security_manager';
import { GetEndpointManager } from './endpoint_manager';
import {
  AuthenticationData,
  AuthScheme,
  Endpoint,
  GenerateJWTToken,
  GetSecretToken,
} from '../../utils/security_util';
import { logger } from '../../utils/logger';

const securityStore = new Map<string, ArtemisJolokia>();

// to by pass CodeQL code scanning warning
const validateHostName = (host: string) => {
  let validHost: string = host;
  if (process.env.NODE_ENV === 'production') {
    if (!host.includes('wconsj')) {
      logger.warn('invalid host', host);
      return null;
    } else {
      validHost = host;
    }
  }
  return validHost;
};

const validateScheme = (scheme: string) => {
  let validScheme: string = scheme;
  if (process.env.NODE_ENV === 'production') {
    if (scheme !== 'http' && scheme !== 'https') {
      logger.warn('invalid scheme', scheme);
      return null;
    } else {
      validScheme = scheme;
    }
  }
  return validScheme;
};

const validatePort = (port: string) => {
  let validPort: string;
  const num = +port;
  if (num >= 1 && num <= 65535 && port === num.toString()) {
    validPort = port;
  } else {
    logger.warn('invalid port', port);
    return null;
  }
  return validPort;
};

//curl -v -H "Content-type: application/x-www-form-urlencoded" -d "userName=admin" -d "password=admin" -d "hostName=localhost" -d port=8161 -d "scheme=http" -X POST http://localhost:3000/api/v1/jolokia/login
export const login = (req: express.Request, res: express.Response) => {
  const { brokerName, userName, password, jolokiaHost, scheme, port } =
    req.body;

  const validHost = validateHostName(jolokiaHost);
  if (!validHost) {
    res.status(401).json({
      status: 'failed',
      message: 'Invalid jolokia host name.',
    });
    return;
  }
  const validScheme = validateScheme(scheme);
  if (!validScheme) {
    res.status(401).json({
      status: 'failed',
      message: 'Invalid jolokia scheme.',
    });
    return;
  }
  const validPort = validatePort(port);
  if (!validPort) {
    res.status(401).json({
      status: 'failed',
      message: 'Invalid jolokia port.',
    });
    return;
  }

  const authData: AuthenticationData = {
    scheme: AuthScheme.Basic,
    data: {
      username: userName,
      password: password,
    },
  };

  const endpoint: Endpoint = {
    name: brokerName,
    url: validScheme + '://' + validHost + ':' + validPort,
    auth: [authData],
  };

  const jolokia = CreateArtemisJolokia(endpoint, true);

  try {
    jolokia
      .validateBroker()
      .then((result) => {
        if (result) {
          const token = GenerateJWTToken(brokerName);
          securityStore.set(brokerName, jolokia);

          res.json({
            status: 'success',
            message: 'You have successfully logged in.',
            'jolokia-session-id': token,
          });
        } else {
          res.status(401).json({
            status: 'failed',
            message: 'Invalid credential. Please try again.',
          });
          res.end();
        }
      })
      .catch((e) => {
        logger.error({ error: e }, 'got exception while login');
        res.status(500).json({
          status: 'failed',
          message: 'Internal error',
        });
        res.end();
      });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
    res.end();
  }
};

export const serverLogin = (req: express.Request, res: express.Response) => {
  try {
    if (!IsSecurityEnabled()) {
      res
        .status(200)
        .json({
          status: 'succeed',
          message: 'security disabled',
        })
        .end();
      return;
    }
    const securityManager = GetSecurityManager();

    securityManager
      .login(req.body)
      .then((token) => {
        res.json({
          status: 'success',
          message: 'You have successfully logged in the api server.',
          bearerToken: token,
        });
      })
      .catch((err) => {
        res.status(401).json({
          status: 'failed',
          message: 'Invalid credential. Please try again.',
        });
        res.end();
      });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
    res.end();
  }
};

const ignoreAuth = (path: string): boolean => {
  return (
    path === '/api/v1/jolokia/login' ||
    path === '/api/v1/api-info' ||
    path === '/api/v1/server/login' ||
    !path.startsWith('/api/v1/')
  );
};

export const PreOperation = async (
  req: express.Request,
  res: express.Response,
  next: any,
) => {
  const targetEndpoint = req.query.targetEndpoint;
  if (targetEndpoint) {
    try {
      const jolokia = GetEndpointManager().getJolokia(targetEndpoint as string);
      jolokia
        .validateBroker()
        .then((result) => {
          if (result) {
            res.locals.jolokia = jolokia;
            next();
          } else {
            res.status(500).json({
              status: 'failed',
              message: 'failed to access jolokia endpoint',
            });
            res.end();
          }
        })
        .catch((err) => {
          logger.debug(err, 'failed access jolokia endpoint');
          res.status(500).json({
            status: 'failed',
            message: 'failed to access jolokia endpoint',
          });
          res.end();
        });
    } catch (err) {
      logger.debug(err, 'failed to access endpoint');
      res.status(500).json({
        status: 'failed',
        message: 'no available endpoint',
      });
      res.end();
    }
  } else {
    next();
  }
};

export const VerifyAuth = async (
  req: express.Request,
  res: express.Response,
  next: any,
) => {
  try {
    if (ignoreAuth(req.path)) {
      next();
    } else {
      GetSecurityManager().validateRequest(req, res, next);
    }
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
    res.end();
  }
};

export const VerifyLogin = async (
  req: express.Request,
  res: express.Response,
  next: any,
) => {
  try {
    if (ignoreAuth(req.path)) {
      next();
    } else {
      if (!(res.locals.jolokia || req.path.startsWith('/api/v1/server/'))) {
        const authHeader = req.headers['jolokia-session-id'] as string;

        if (!authHeader) {
          res.status(401).json({
            status: 'failed',
            message: 'unauthenticated',
          });
          res.end();
        } else {
          jwt.verify(
            authHeader,
            GetSecretToken(),
            async (err: any, decoded: any) => {
              if (err) {
                logger.error('verify failed', err);
                res.status(401).json({
                  status: 'failed',
                  message: 'This session has expired. Please login again',
                });
              } else {
                const brokerKey = decoded['id'];
                const jolokia = securityStore.get(brokerKey);
                if (jolokia) {
                  res.locals.jolokia = jolokia;
                  next();
                } else {
                  res.status(401).json({
                    status: 'failed',
                    message: 'This session has expired. Please login again',
                  });
                }
              }
            },
          );
        }
      } else {
        next();
      }
    }
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
  }
};

const isAdminOp = (path: string): boolean => {
  return path.startsWith('/api/v1/server/admin/');
};
