import base64 from 'base-64';
import jwt from 'jsonwebtoken';
import { Headers } from 'node-fetch';
import https from 'https';
import fs from 'fs';
import http from 'http';
import { logger } from './logger';
import * as crypto from 'crypto';

export const GetSecretToken = (): string => {
  return process.env.SECRET_ACCESS_TOKEN as string;
};

export const GenerateJWTToken = (id: string): string => {
  const payload = {
    id: id,
  };
  return jwt.sign(payload, GetSecretToken(), {
    expiresIn: 60 * 60 * 1000,
  });
};

export enum AuthType {
  Jwt = 'jwt',
  Unknown = 'unknown',
}

export interface User {
  id: string;
  email?: string;
  hash: string;
}

export interface UserList {
  users: User[];
}

export enum AuthScheme {
  //user name and password
  Basic = 'basic',
  //client cert in mtls
  Cert = 'cert',
}

export interface AuthenticationData {
  readonly scheme: AuthScheme;
  readonly data: any;
}

export interface BasicAuthData {
  readonly username: string;
  readonly password: string;
}

export interface CertAuthData {
  readonly certpath: string;
  readonly keypath: string;
}

export interface Endpoint {
  readonly name: string;
  readonly url: string;
  readonly jolokiaPrefix?: string;
  readonly auth: AuthenticationData[];
}

export interface EndpointList {
  endpoints: Endpoint[];
}

export interface AuthOptions {
  agent?: http.Agent;
  headers: Headers;
}

export abstract class AuthHandler {
  abstract handleRequest(reqUrl: string, authOpts: AuthOptions): void;
  isHttps = (url: string): boolean => {
    return url.startsWith('https://');
  };
}

export class BasicAuthHandler extends AuthHandler {
  readonly isFromClient: boolean;
  readonly basicAuth: BasicAuthData;
  readonly alg = 'aes-256-cbc';
  readonly encryptPassword: string;
  readonly encryptKey: string;
  static readonly DEFAULT_KEY = 'b5jzzVaGF5jCzIYYrH0ClfsKdXB2bYSSSgPN0e4lZmc=';
  static readonly DEFAULT_ENC_PASSWORD = 'defaultpassword';

  constructor(cred: BasicAuthData, isFromClient = false) {
    super();
    this.isFromClient = isFromClient;
    this.basicAuth = cred;
    this.encryptPassword = process.env.API_SERVER_ENC_PASSWORD
      ? process.env.API_SERVER_ENC_PASSWORD
      : BasicAuthHandler.DEFAULT_ENC_PASSWORD;
    this.encryptKey = process.env.API_SERVER_ENC_KEY
      ? process.env.API_SERVER_ENC_KEY
      : BasicAuthHandler.DEFAULT_KEY;
  }

  handleRequest = (reqUrl: string, authOpts: AuthOptions): void => {
    if (this.isHttps(reqUrl)) {
      authOpts.agent = new https.Agent({
        rejectUnauthorized: false,
      });
    }

    const password = this.isFromClient
      ? this.basicAuth.password
      : decryptPassword(this.basicAuth.password, this.alg, this.encryptKey);
    authOpts.headers.set(
      'Authorization',
      'Basic ' + base64.encode(this.basicAuth.username + ':' + password),
    );
  };
}

class CertAuthHandler extends AuthHandler {
  readonly certAuth: CertAuthData;

  constructor(cred: CertAuthData) {
    super();
    this.validateFiles(cred);
    this.certAuth = cred;
  }

  validateFiles = (cred: CertAuthData) => {
    if (!fs.existsSync(cred.certpath)) {
      throw Error('cert file not exist');
    }
    if (!fs.existsSync(cred.keypath)) {
      throw Error('key file not exist');
    }
  };

  getCert = () => {
    return fs.readFileSync(this.certAuth.certpath);
  };

  getKey = () => {
    return fs.readFileSync(this.certAuth.keypath);
  };

  handleRequest = (reqUrl: string, authOpts: AuthOptions): void => {
    logger.warn(
      'The certificate authentication is experimental and may not work properly',
    );
    if (!this.isHttps(reqUrl)) {
      throw Error('auth only works with https');
    }
    authOpts.agent = new https.Agent({
      // Disables certificate validation, can we use this instead of setting NODE_TLS_REJECT_UNAUTHORIZED='0'?
      rejectUnauthorized: false,
      // ca: trusted ca bundle
      cert: this.getCert(),
      key: this.getKey(),
    });
  };
}

export const CreateAuthHandler = (
  data: AuthenticationData,
  isFromClient: boolean,
): AuthHandler => {
  switch (data.scheme) {
    case AuthScheme.Basic: {
      return new BasicAuthHandler(data.data, isFromClient);
    }
    case AuthScheme.Cert: {
      return new CertAuthHandler(data.data);
    }
    default: {
      throw Error('auth scheme not supported: ' + data.scheme);
    }
  }
};

export const createEncryptKey = (password: string): Buffer => {
  const salt = crypto.randomBytes(32).toString('hex');
  const key = crypto.scryptSync(password, salt, 32);
  return key;
};

export const encryptPassword = (
  plainText: string,
  alg: string,
  password: string,
): { masked: string; key: string } => {
  const key = createEncryptKey(password);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(alg, key, iv);

  let encrypted = cipher.update(plainText);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    masked: iv.toString('hex') + ':' + encrypted.toString('hex'),
    key: key.toString('base64'),
  };
};

export const decryptPassword = (
  encrypted: string,
  alg: string,
  key: string,
): string => {
  const { ivString, encryptedDataString } = splitEncryptedText(encrypted);

  const iv = Buffer.from(ivString, 'hex');
  const encryptedText = Buffer.from(encryptedDataString, 'hex');

  const decipher = crypto.createDecipheriv(alg, Buffer.from(key, 'base64'), iv);

  const decrypted = decipher.update(encryptedText);
  return Buffer.concat([decrypted, decipher.final()]).toString();
};

const splitEncryptedText = (encryptedText: string) => {
  const fields = encryptedText.split(':');
  return {
    ivString: fields[0],
    encryptedDataString: fields[1],
  };
};
