FROM nginx:1.27-alpine

ARG NGINX_CONF=nginx-http.conf

RUN rm -rf /usr/share/nginx/html/*
COPY public/ /usr/share/nginx/html/
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
