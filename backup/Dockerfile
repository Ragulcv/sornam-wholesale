# Daily encrypted backup of the Sornam Wholesale database.
# postgres:18 so pg_dump matches Neon's PG18 exactly (an older pg_dump refuses
# to dump a newer server).
FROM postgres:18-alpine
RUN apk add --no-cache nodejs openssl tzdata
ENV TZ=Asia/Kolkata NODE_ENV=production
WORKDIR /app
COPY server.mjs backup.mjs config.mjs cli.mjs ./
COPY destinations ./destinations
# the service runs as postgres, so it must own the volume it writes to
RUN mkdir -p /backups && chown postgres:postgres /backups
VOLUME ["/backups"]
EXPOSE 4100
USER postgres
CMD ["node", "server.mjs"]
