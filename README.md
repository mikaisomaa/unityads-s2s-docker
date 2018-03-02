# nodejs-gameapi-docker-example
Example NodeJS Docker container for a simple server-to-server callback endpoint for Unity Ads

This example sets up containers for NodeJS server and MongoDB. The application will be exposed to a defined localhost port (3000 by default).

You'll need set up external reverse proxy if you wish to expose it further, or you could amend the docker-compose.yml to include a nginx container.

## How to use

* You need to install and setup docker; you also need the docker-compose tool
* Create a file named .env and put in values for environment variables: EXTERNAL_HOST_PORT, INTERNAL_DOCKER_PORT and UNITYADSSECRET. For an example, please see file: env-example
* Run command: docker-compose up --build -d
* Done

## Authors

* Example app: Mika Isomaa
