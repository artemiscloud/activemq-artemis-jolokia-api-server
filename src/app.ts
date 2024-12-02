import createServer from './utils/server';
import https from 'https';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { InitLoggers, logger } from './utils/logger';

dotenv.config();

InitLoggers();

logger.info(
  `Starting plugin ${process.env.PLUGIN_NAME} ${process.env.PLUGIN_VERSION}`,
);

const isReqLogEnabled = process.env.ENABLE_REQUEST_LOG || 'false';

createServer(isReqLogEnabled === 'true')
  .then((server) => {
    let options = {};

    if (process.env.NODE_ENV === 'production') {
      logger.info(
        'setting up tls in production mode',
        'cert',
        process.env.SERVER_CERT,
      );

      if (
        process.env.SERVER_KEY !== undefined &&
        process.env.SERVER_CERT !== undefined
      ) {
        options = {
          key: fs.readFileSync(process.env.SERVER_KEY),
          cert: fs.readFileSync(process.env.SERVER_CERT),
        };
      } else {
        throw new Error('Missing cert/key files');
      }
    } else {
      logger.info('setting up tls using dev certs');
      options = {
        key: fs.readFileSync(path.join(__dirname, 'config/domain.key')),
        cert: fs.readFileSync(path.join(__dirname, 'config/domain.crt')),
      };
    }
    const secureServer = https.createServer(options, server);
    secureServer.listen(9443, () => {
      logger.info('Listening on https://0.0.0.0:9443');
      const securityEnabled =
        process.env.API_SERVER_SECURITY_ENABLED !== 'false';
      if (securityEnabled) {
        logger.info('security is enabled.');
      } else {
        logger.warn('security is disabled.');
      }
    });
  })
  .catch((err) => {
    logger.error(`Error: ${err}`);
    process.exit(1);
  });
