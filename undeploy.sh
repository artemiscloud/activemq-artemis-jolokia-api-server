#!/usr/bin/env sh

oc kustomize deploy/default | oc delete -f -
