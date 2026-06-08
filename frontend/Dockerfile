# frontend/Dockerfile

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# Use `npm install` (not `npm ci`): the Alpine/musl build image needs different
# optional binaries (esbuild/rollup/@emnapi) than the glibc host where the lock is
# generated, and `npm ci`'s strict lock check rejects that mismatch.
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
