# Local infrastructure

This folder contains local development infrastructure (Postgres + Redis).

## Start

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Stop

```bash
docker compose -f infra/docker-compose.yml down
```

## Notes
- Postgres runs on `localhost:5432` with database `xcleaner` and user/password `postgres/postgres`.
- Redis runs on `localhost:6379`.

