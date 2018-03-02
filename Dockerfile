FROM node:latest

ARG PORT

RUN mkdir /app
WORKDIR /app

COPY ./app/* /app/

RUN npm install

EXPOSE $PORT

CMD ["npm", "start"]
