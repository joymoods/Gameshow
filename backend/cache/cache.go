package cache

import (
	"context"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client

func Connect(ctx context.Context, url string) error {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return err
	}
	client = redis.NewClient(opts)
	return client.Ping(ctx).Err()
}

func Client() *redis.Client {
	return client
}

func Close() {
	if client != nil {
		client.Close()
	}
}
