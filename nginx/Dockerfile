FROM nginx:alpine
ARG NGINX_CONF=nginx/nginx-multi.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY frontend/dist /usr/share/nginx/html
