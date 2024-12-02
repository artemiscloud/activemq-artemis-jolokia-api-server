import fs from 'fs';
import yaml from 'js-yaml';
import * as bcrypt from 'bcryptjs';
import {
  AuthType,
  GenerateJWTToken,
  GetSecretToken,
  User,
  UserList,
} from '../../utils/security_util';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

const getAuthType = (): AuthType => {
  if (!process.env.API_SERVER_SECURITY_AUTH_TYPE) {
    return AuthType.Jwt;
  }
  if (process.env.API_SERVER_SECURITY_AUTH_TYPE === 'jwt') {
    return AuthType.Jwt;
  }
  return AuthType.Unknown;
};

export interface SecurityManager {
  start(): Promise<void>;
  getSecurityStore(): SecurityStore;
  login(credential: any): Promise<string>;
  validateRequest(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: any,
  ): void;
}

interface SecurityStore {
  getAllUsers(): Map<string, User>;
  start(): Promise<void>;
  findUser(userName: any): Promise<User>;
  authenticate(userName: string, password: string): User | null;
}

export class LocalSecurityStore implements SecurityStore {
  usersFile: string;
  // userName => User
  usersMap: Map<string, User>;
  // user -> allowed endpoints
  userAccessTable = new Map<string, Set<string>>();
  // user -> roles
  userRolesTable = new Map<string, Set<string>>();

  getAllUsers(): Map<string, User> {
    return this.usersMap;
  }

  start = async () => {
    this.usersFile = process.env.USERS_FILE_URL
      ? process.env.USERS_FILE_URL
      : '.users.json';
    this.usersMap = LocalSecurityStore.loadUsers(this.usersFile);
    fs.watch(this.usersFile, { persistent: false }, () => {
      this.usersMap = LocalSecurityStore.loadUsers(this.usersFile);
    });
  };

  static loadUsers = (fileUrl: string): Map<string, User> => {
    const usersMap = new Map<string, User>();
    if (fs.existsSync(fileUrl)) {
      const fileContents = fs.readFileSync(fileUrl, 'utf8');
      const data = yaml.load(fileContents) as UserList;
      data?.users?.forEach((user) => {
        usersMap.set(user.id, user);
      });
    }
    return usersMap;
  };

  findUser = async (userName: string): Promise<User> => {
    if (this.usersMap.has(userName)) {
      return this.usersMap.get(userName);
    }
    throw Error(`No such user ${userName}`);
  };

  authenticate = (userName: string, password: string): User | null => {
    let authUser = null;

    if (this.usersMap.has(userName)) {
      const user = this.usersMap.get(userName);
      if (bcrypt.compareSync(password, user.hash)) {
        authUser = user;
      }
    }
    return authUser;
  };
}

class JwtSecurityManager implements SecurityManager {
  readonly securityStore: SecurityStore = new LocalSecurityStore();

  getSecurityStore(): SecurityStore {
    return this.securityStore;
  }

  login = async (credential: any): Promise<string> => {
    const { userName, password } = credential;
    const user = this.securityStore.authenticate(userName, password);
    if (user) {
      const token = GenerateJWTToken(userName);
      return token;
    }
    throw Error('wrong credentials');
  };

  validateRequest = (
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: any,
  ): void => {
    passport.authenticate(AuthType.Jwt, { session: false })(req, res, next);
  };

  start = async () => {
    this.securityStore.start().then(() => {
      const opts = {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: GetSecretToken(),
        ignoreExpiration: false,
      };

      passport.use(
        new JwtStrategy(opts, (jwt_payload, done) => {
          const userName = jwt_payload.id;
          if (userName) {
            //find the user
            const user = this.securityStore.findUser(userName).then((user) => {
              if (user) {
                return done(null, user);
              } else {
                return done(null, false);
              }
            });
          } else {
            return done(null, false);
          }
        }),
      );
    });
  };
}

let securityManager: SecurityManager;

export const InitSecurity = async () => {
  if (IsSecurityEnabled()) {
    const securityManager = GetSecurityManager();
    await securityManager.start();
  }
};

export const GetSecurityManager = (): SecurityManager => {
  if (!securityManager) {
    const authType = getAuthType();
    if (authType === AuthType.Jwt) {
      securityManager = new JwtSecurityManager();
    } else {
      throw Error('Auth type not supported ' + authType);
    }
  }
  return securityManager;
};

export const IsSecurityEnabled = (): boolean => {
  return process.env.API_SERVER_SECURITY_ENABLED !== 'false';
};
