FROM golang:1.27.1-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64 \
    go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/race-controller \
    ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/race-controller /race-controller

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/race-controller"]