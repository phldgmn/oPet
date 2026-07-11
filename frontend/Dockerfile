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
RUN sed -i 's/^user  *nginx;//' /etc/nginx/nginx.conf \
  && touch /var/run/nginx.pid \
  && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
