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
./deploy.sh [-i <image> -n]
```

The optional `-i <image>` (or `--image <image>`) argument allows you to pass in
the plugin image. If not specified the default
`quay.io/artemiscloud/activemq-artemis-jolokia-api-server:latest` is
deployed. for example:

```sh
./deploy.sh -i quay.io/<repo-username>/activemq-artemis-jolokia-api-server:1.0.1
```

The `deploy.sh` script uses `oc kustomize` (built-in
[kustomize](https://github.com/kubernetes-sigs/kustomize)) command to configure
and deploy the plugin using resources and patches defined under ./deploy
directory.

To undeploy, run

```sh
./undeploy.sh
```

# Jolokia api-server Cli tool (work in progress)

The Jolokia api-server comes with a cli (command line interface) tool. When the cli tool starts it connects to the api-server and can access the jolokia endpoints.

The cli tool takes a **command** and requests the api-server using [its api](src/config/openapi.yml) to invoke on the target jolokia endpint, gets back the response and printing the result to the console in JSON format.

It can run in `interactive mode` or in `non-interactive` mode.

To build the cli tool run

```
yarn build
```

which will build both the api-server and cli tool.

To install the cli tool runnable locally run:

```
npm link
```

It will create the cli runnable `jolokia-api-server-cli`

## Running the cli tool

The cli tool needs a running api-server.

To start the cli tool run

```
jolokia-api-server-cli [options]
```

or you can use `yarn`

```
yarn start-cli [options]
```

## Using Cli tool in non-interactive mode

In this mode, the tool starts and execute a command and then exits.

The syntax for non-interactive mode is:

```
jolokia-api-server-cli <command> -l <api-server-url> -e <jolokia-endpoint-url>
```

If `-l` option is omitted the default is ` https://localhost:9443`

The `-e` option is the target jolokia url. for example

```
-e http://user:password@127.0.0.1:8161
```

If the port number part is omitted, the default
is `80` for http and `443` for https.

The `command` is the command to be executed.

Note in non-interactive mode the `command` need be quoted as it contains spaces.

Example:

```
jolokia-api-server-cli "get queue TEST -a MessageCount RoutingType" -e http://user:pass@127.0.0.1:8161
```

(the -s option can suppress yarn's own output)

## Using Cli tool in interactive mode

In interactive mode the tool starts into a command shell and
accepts user input as a command, then it executes it and went
back to the shell prompt to accept another, until you run the `exit`
command.

The syntax to run the cli in this mode is

```
jolokia-api-server-cli -i
```

When it starts it print the cli title and ready to accept
commands.

With interactive mode the cli can 'caches' a list of jolokia endpoints (added by the `add` command
only available in interactive mode). It takes one of them as `current endpoint` so when user types
a command without specifying target jolokia endpoint, the `current endpoint` will be used.

## Using Cli Commands

### The `get` command

This is the only available command currently. It can retrive
information from a jolokia endpoint.

The syntax of this command is

```
get <path> <name> <-a attributes...> <-o operations...>
```

It takes a `path` argument, a `name` argument, an optional `-a`(attribute) option and an optional
`-o` (operation) option.

The value of path is a string representing a target mbean from which you want to get information.
It takes the form [target endpoint]/[component]. The `target endpoint` in `interactive` mode allows
you to specify which broker you want to retrieve information from. If absent it takes the current broker
cached by the cli. In non-interactive mode that [target endpoint] can be empty if `-e` option is given,
or it is the target remote endpoint name prefix by a `@` char. For example `@broker1/`

The `component` part is the type of the mbean. Currently the supported mbean types are

- `queue`
- `address`
- `acceptor`
- `cluster-connection`

The <name> argument is the mbean name.

The value of `-a` option is a list of attribute names (space or comma separated) to read from the target mbean.
If the value is a `*` it will read all the attributes of the target mbean.

The value of `-o` option is a list of operation names (space or comma separated) to read from the target mbean.
If the value is a `*` it will read all the operations of the target mbean. When retrieving operation informations
the `name` part of the component if optional because operations are defined on the component type rather than
a specific mbean.??

examples:

`get /` - get the broker mbean information

`get /*` - get all mbeans registered with the broker mbean

`get / -a *` - read all the attributes of the broker mbean

`get / -a * -o *` - read information of all attributes and operations of the broker mbean

`get queue` (or `get /queue`) - list all the queue mbeans information

`get acceptor acceptor0 -a *` - read all attributes of acceptor named `acceptor0`

`get queue TEST -a MessageCount RoutingType` - read `MessageCount` and `RoutingType` of queue `TEST`

`get queue -o xxx` - read information of operation xxx of queue TEST

### The `run` command

The `run` command is used to invoke operations on a jolokia endpoint.

The syntax of this command is

```
run <path> <name> <op> <parameters...>
```

It takes a `path` argument, a `name` argument and optional `-a`(attribute) option

### Commands exclusive to Interactive mode

There are several commands that are only available to interactive mode.

#### The `add` command

Add a jolokia endpoint to the cli cache. Syntax:

```
add <endpoint name> <url> -u <user> -p <password>
```

example:

```
add ex-aao-ssl https://ex-aao-ssl-wconsj-0-svc-rte-default.apps-crc.testing -u user -p password
```

#### The `switch` command

To switch current endpoint to another. Syntax:

```
switch <endpoint name>
```

example:

```
switch broker0
```

#### The `list` command

To list all the jolokia endpoints cached in cli and managed on the api-server. Syntax:

```
list
```

With the cached enpoints in this mode, user can run a command against a cached jolokia endpoint.
For example:

`get ex-aao-ssl/queue DLQ -a MessageCount`

will read `MessageCount` attribute of queue DLQ on endpoint `ex-aao-ssl` in the cached endpoint list.
