# Jolokia api-server

The Jolokia api-server is an express js server that serves an OpenApi defined
api as an overlay to jolokia servers, translating the jolokia answers to json
when needed.

Checkout the api.md file to know more about what operations are currently
supported.

## Dev setup

```
yarn build
yarn start
```

## Documentation generation

After updating the `openapi.yml` file, please make sure to generate the
documentation:

```
yarn run build-api-doc
```

## Production build

1. Build the image:
   ```sh
   docker build -t quay.io/artemiscloud/activemq-artemis-jolokia-api-server:latest .
   ```
2. Push the image to image registry:
   ```sh
   docker push quay.io/artemiscloud/activemq-artemis-jolokia-api-server:latest
   ```

### deploy the service

```sh
./deploy.sh [-i <image> -ns]
```

The optional `-i <image>` (or `--image <image>`) argument allows you to pass in
the plugin image. If not specified the default
`quay.io/artemiscloud/activemq-artemis-jolokia-api-server:latest` is
deployed. for example:

```sh
./deploy.sh -i quay.io/<repo-username>/activemq-artemis-jolokia-api-server:1.0.1
```
The optional -ns (or --nosec) argument can be used to disable security.

---
**Note:**

you should enable security in your application. Disable security can only
be used for test purposes.

---

The `deploy.sh` script uses `oc kustomize` (built-in
[kustomize](https://github.com/kubernetes-sigs/kustomize)) command to configure
and deploy the plugin using resources and patches defined under ./deploy
directory.

To undeploy, run

```sh
./undeploy.sh
```

### Notes about the JWT secret

The api server uses SECRET_ACCESS_TOKEN env var to get the secret for generating
jwt tokens. It has a default value in .env for dev purposes.

In production you should override it with your own secret.

The jwt-key-gen.sh is a tool to generate a random key and used in Dockerfile.
It makes sure when you build the api server image a new random key is used.

## Security Model of the API Server

The API Server provides a security model that provides authentication and authorization of incoming clients.
The security can be enabled/disabled (i.e. via `API_SERVER_SECURITY_ENABLED` env var)

### Authentication

Currently the api server support `jwt` token authentication.

#### The login api

The login api is defined in openapi.yml

```yaml
/server/login
```

A client logs in to an api server by sending a POST request to the login path. The request body contains login information (i.e. username and password for jwt authentication type)

Please refer to [api.md](api.md) for details of the log api.

Currently the security manager uses local file to store user's info. The default users file name is `.users.json`
The users file name can be configured using `USERS_FILE_URL` env var. See `.test.users.json` for sample values.

### Authorization

Currently the api server doesn't perform authorization on logged in users.

### Endpoints Management

The server keeps a list of jolokia endpoints for clients to access. The endpoints are loaded from a local file named
`.endpoints.json`. Each top level entry represents a jolokia endpoint. An entry has a unique name and details to access the jolokia api. See `.test.endpoints.json` for sample values.

### Accessing a jolokia endpoint

When an authenticated client sends a request to the api-server, it should present its token in the request header

    'Authorization: Bearer `token`'

It also need to give the `targetEndpoint` in the query part of the request if the request is to access an jolokia endpoint.

For example `/execBrokerOperation?targetEndpoint=broker1`.

### Direct Proxy

Direct Proxy means a client can pass a broker's endpoint info to the api-server in order to access it via the api-server.
For example the [self-provisioning plugin](https://github.com/artemiscloud/activemq-artemis-self-provisioning-plugin) uses this api to access the jolokia of a broker's jolokia endpoint.
