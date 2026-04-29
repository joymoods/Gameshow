package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

var pool *pgxpool.Pool

func Connect(ctx context.Context, dsn string) error {
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return err
	}
	if err := p.Ping(ctx); err != nil {
		p.Close()
		return err
	}
	pool = p
	return nil
}

func Pool() *pgxpool.Pool {
	return pool
}

func Close() {
	if pool != nil {
		pool.Close()
	}
}
