FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /games-backend .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /games-backend /games-backend
EXPOSE 8080
ENTRYPOINT ["/games-backend"]
