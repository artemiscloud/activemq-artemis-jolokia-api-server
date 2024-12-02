#!/usr/bin/env sh

DEFAULT_IMAGE="quay.io/artemiscloud/activemq-artemis-jolokia-api-server:latest"
API_SERVER_IMAGE=${DEFAULT_IMAGE}
API_SERVER_DISABLE_SECURITY='false'
SCRIPT_NAME=$(basename "$0")

function printUsage() {
  echo "${SCRIPT_NAME}: Deploying to openshift"
  echo "Usage:"
  echo "  ./${SCRIPT_NAME} -i|--image <image url>"
  echo "Options: "
  echo "  -i|--image  Specify the plugin image to deploy. (default is ${DEFAULT_IMAGE})"
  echo "  -ns|--no-sec  Disable security. (default is false)"
  echo "  -h|--help   Print this message."
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      printUsage
      exit 0
      ;;
    -i|--image)
      API_SERVER_IMAGE="$2"
      shift
      shift
      ;;
    -ns|--nosec)
      API_SERVER_DISABLE_SECURITY="true"
      shift
      ;;
    -*|--*)
      echo "Unknown option $1"
      printUsage
      exit 1
      ;;
    *)
      ;;
  esac
done

echo "deploying using image: ${API_SERVER_IMAGE}"
if [ ${API_SERVER_DISABLE_SECURITY} == "true" ]; then
  echo "warning: security disabled."
  oc kustomize deploy/security-disabled | sed "s|image: .*|image: ${API_SERVER_IMAGE}|" | oc apply -f -
else
  oc kustomize deploy/default | sed "s|image: .*|image: ${API_SERVER_IMAGE}|" | oc apply -f -
fi
