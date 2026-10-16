FROM nginxinc/nginx-unprivileged:stable-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY app.js /usr/share/nginx/html/app.js
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
