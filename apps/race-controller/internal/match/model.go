package match

import "time"

type Status string

const (
	StatusCreating Status = "CREATING"
	StatusReady    Status = "READY"
	StatusRunning  Status = "RUNNING"
	StatusFinished Status = "FINISHED"
	StatusError    Status = "ERROR"
)

type Player struct {
	Slot    int    `json:"slot"`
	Address string `json:"address"`
}

type Match struct {
	ID          string     `json:"id"`
	Seed        int64      `json:"seed"`
	Status      Status     `json:"status"`
	PlayerCount int        `json:"playerCount"`
	Players     []Player   `json:"players"`
	CreatedAt   time.Time  `json:"createdAt"`
	ReadyAt     *time.Time `json:"readyAt,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
}
