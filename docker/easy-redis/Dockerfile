FROM redis:7-alpine

COPY redis.conf /redis.conf

EXPOSE 6379
CMD ["redis-server", "/redis.conf"]

# docker build -t easy-dyad/easy-redis:latest path/to/easy-redis
# docker compose -f docker-compose.yml up -d --build
