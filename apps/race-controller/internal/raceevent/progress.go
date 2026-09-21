package raceevent

import (
	"slices"
	"time"
)

type MatchProgress struct {
	MatchID string           `json:"matchId"`
	Players []PlayerProgress `json:"players"`
}

type PlayerProgress struct {
	Slot           int        `json:"slot"`
	PlayerUUID     string     `json:"playerUuid,omitempty"`
	PlayerName     string     `json:"playerName,omitempty"`
	Online         bool       `json:"online"`
	Deaths         int        `json:"deaths"`
	EnteredNether  bool       `json:"enteredNether"`
	EnteredEnd     bool       `json:"enteredEnd"`
	DragonDefeated bool       `json:"dragonDefeated"`
	Advancements   []string   `json:"advancements"`
	EventCount     int        `json:"eventCount"`
	LastEventAt    *time.Time `json:"lastEventAt,omitempty"`
}

func (s *Service) Progress(
	matchID string,
	playerCount int,
) MatchProgress {
	progress := MatchProgress{
		MatchID: matchID,
		Players: make([]PlayerProgress, playerCount),
	}

	advancementSets := make(
		[]map[string]struct{},
		playerCount,
	)

	for index := range playerCount {
		progress.Players[index] = PlayerProgress{
			Slot:         index + 1,
			Advancements: make([]string, 0),
		}

		advancementSets[index] = make(map[string]struct{})
	}

	for _, event := range s.ListByMatch(matchID) {
		if event.Slot < 1 || event.Slot > playerCount {
			continue
		}

		index := event.Slot - 1
		player := &progress.Players[index]

		if event.PlayerUUID != "" {
			player.PlayerUUID = event.PlayerUUID
		}

		if event.PlayerName != "" {
			player.PlayerName = event.PlayerName
		}

		player.EventCount++

		occurredAt := event.OccurredAt
		player.LastEventAt = &occurredAt

		switch event.Type {
		case TypePlayerJoined:
			player.Online = true

		case TypePlayerQuit:
			player.Online = false

		case TypePlayerDied:
			player.Deaths++

		case TypeEnteredNether:
			player.EnteredNether = true

		case TypeEnteredEnd:
			player.EnteredEnd = true

		case TypeDragonDefeated:
			player.DragonDefeated = true

		case TypeAdvancementCompleted:
			if event.AdvancementKey == "" {
				continue
			}

			if _, exists :=
				advancementSets[index][event.AdvancementKey]; exists {
				continue
			}

			advancementSets[index][event.AdvancementKey] =
				struct{}{}

			player.Advancements = append(
				player.Advancements,
				event.AdvancementKey,
			)
		}
	}

	for index := range progress.Players {
		slices.Sort(progress.Players[index].Advancements)
	}

	return progress
}
