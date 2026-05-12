# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build
WORKDIR /repo/frontend
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

COPY frontend/package.json ./package.json
RUN --mount=type=cache,target=/root/.npm \
  npm install --no-audit --no-fund

COPY frontend .
COPY i18n ../i18n
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
