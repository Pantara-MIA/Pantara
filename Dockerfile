# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci || npm install
COPY web/ ./
RUN npm run build

# Stage 2: Build Go Backend
FROM golang:1.26-alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Replace the (possibly empty) web/dist with the build from stage 1
COPY --from=frontend-builder /app/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/pantara ./cmd/server

# Stage 3: Minimal Runtime Image
FROM alpine:latest
WORKDIR /root/
# .env.example as a placeholder; real values come from the runtime environment
COPY .env.example .env
COPY --from=backend-builder /app/pantara .
RUN chmod +x ./pantara

EXPOSE 8080
CMD ["./pantara"]
