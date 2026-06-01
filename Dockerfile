FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY google-apps-script ./google-apps-script

CMD ["npm", "start"]
