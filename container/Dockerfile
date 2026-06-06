FROM node:22-slim
WORKDIR /srv
COPY package.json ./
COPY build-server.mjs ./
EXPOSE 8080
CMD ["node", "build-server.mjs"]
