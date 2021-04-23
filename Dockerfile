# BUILD IMAGE
FROM node:12.21.0-alpine
WORKDIR /opt/sofie-spreadsheet-gateway
COPY . .
RUN yarn install --check-files --frozen-lockfile
RUN yarn build:main

# DEPLOY IMAGE
FROM node:12.21.0-alpine
RUN apk add --no-cache tzdata
COPY --from=0 /opt/sofie-spreadsheet-gateway /opt/sofie-spreadsheet-gateway
WORKDIR /opt/sofie-spreadsheet-gateway
CMD ["yarn", "start"]