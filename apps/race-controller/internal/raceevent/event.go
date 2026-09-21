package raceevent

import "time"

type Type string

const (
	TypePlayerJoined         Type = "PLAYER_JOINED"
	TypePlayerQuit           Type = "PLAYER_QUIT"
	TypePlayerDied           Type = "PLAYER_DIED"
	TypeAdvancementCompleted Type = "ADVANCEMENT_COMPLETED"
	TypeEnteredNether        Type = "ENTERED_NETHER"
	TypeEnteredEnd           Type = "ENTERED_END"
	TypeDragonDefeated       Type = "DRAGON_DEFEATED"
)

type Event struct {
	ID             string            `json:"id"`
	MatchID        string            `json:"matchId"`
	Slot           int               `json:"slot"`
	PlayerUUID     string            `json:"playerUuid"`
	PlayerName     string            `json:"playerName"`
	Type           Type              `json:"type"`
	AdvancementKey string            `json:"advancementKey,omitempty"`
	OccurredAt     time.Time         `json:"occurredAt"`
	ReceivedAt     time.Time         `json:"receivedAt"`
	Metadata       map[string]string `json:"metadata,omitempty"`
}
