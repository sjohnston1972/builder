FROM node:22-slim
WORKDIR /srv
COPY package.json ./
COPY build-server.mjs ./
COPY build-lib.mjs ./
EXPOSE 8080
CMD ["node", "build-server.mjs"]
