package raceevent

import (
	"testing"
	"time"
)

func TestServiceProgress(t *testing.T) {
	service := NewService()
	baseTime := time.Date(
		2026,
		9,
		21,
		6,
		0,
		0,
		0,
		time.UTC,
	)

	events := []Event{
		{
			ID:         "join-1",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypePlayerJoined,
			OccurredAt: baseTime,
		},
		{
			ID:         "nether-1",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypeEnteredNether,
			OccurredAt: baseTime.Add(time.Minute),
		},
		{
			ID:             "advancement-1",
			MatchID:        "match-1",
			Slot:           1,
			PlayerUUID:     "player-uuid",
			PlayerName:     "Gonzales2",
			Type:           TypeAdvancementCompleted,
			AdvancementKey: "minecraft:story/mine_stone",
			OccurredAt:     baseTime.Add(2 * time.Minute),
		},
		{
			ID:         "death-1",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypePlayerDied,
			OccurredAt: baseTime.Add(3 * time.Minute),
		},
	}

	for _, event := range events {
		if _, _, err := service.Record(event); err != nil {
			t.Fatalf("Record() error = %v", err)
		}
	}

	progress := service.Progress("match-1", 2)

	if progress.MatchID != "match-1" {
		t.Errorf(
			"MatchID = %q, want match-1",
			progress.MatchID,
		)
	}

	if len(progress.Players) != 2 {
		t.Fatalf(
			"players length = %d, want 2",
			len(progress.Players),
		)
	}

	player1 := progress.Players[0]

	if player1.Slot != 1 {
		t.Errorf("slot = %d, want 1", player1.Slot)
	}

	if player1.PlayerName != "Gonzales2" {
		t.Errorf(
			"player name = %q, want Gonzales2",
			player1.PlayerName,
		)
	}

	if !player1.Online {
		t.Errorf("online = false, want true")
	}

	if !player1.EnteredNether {
		t.Errorf("enteredNether = false, want true")
	}

	if player1.EnteredEnd {
		t.Errorf("enteredEnd = true, want false")
	}

	if player1.Deaths != 1 {
		t.Errorf("deaths = %d, want 1", player1.Deaths)
	}

	if len(player1.Advancements) != 1 {
		t.Fatalf(
			"advancements length = %d, want 1",
			len(player1.Advancements),
		)
	}

	if player1.Advancements[0] !=
		"minecraft:story/mine_stone" {
		t.Errorf(
			"advancement = %q",
			player1.Advancements[0],
		)
	}

	if player1.EventCount != 4 {
		t.Errorf(
			"event count = %d, want 4",
			player1.EventCount,
		)
	}

	player2 := progress.Players[1]

	if player2.Slot != 2 {
		t.Errorf("player 2 slot = %d, want 2", player2.Slot)
	}

	if player2.Advancements == nil {
		t.Errorf("player 2 advancements must not be nil")
	}
}

func TestServiceProgressRanksDragonDefeats(t *testing.T) {
	service := NewService()

	baseTime := time.Date(
		2026,
		9,
		21,
		14,
		0,
		0,
		0,
		time.UTC,
	)

	events := []Event{
		{
			ID:         "player-1-finish",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-1",
			PlayerName: "PlayerOne",
			Type:       TypeDragonDefeated,
			OccurredAt: baseTime.Add(2 * time.Minute),
		},
		{
			ID:         "player-2-finish",
			MatchID:    "match-1",
			Slot:       2,
			PlayerUUID: "player-2",
			PlayerName: "PlayerTwo",
			Type:       TypeDragonDefeated,
			OccurredAt: baseTime,
		},
	}

	for _, event := range events {
		if _, _, err := service.Record(event); err != nil {
			t.Fatalf("Record() error = %v", err)
		}
	}

	progress := service.Progress("match-1", 2)

	player1 := progress.Players[0]
	player2 := progress.Players[1]

	if player1.Rank != 2 {
		t.Errorf("player 1 rank = %d, want 2", player1.Rank)
	}

	if player2.Rank != 1 {
		t.Errorf("player 2 rank = %d, want 1", player2.Rank)
	}

	if player1.FinishedAt == nil {
		t.Fatalf("player 1 FinishedAt is nil")
	}

	if player2.FinishedAt == nil {
		t.Fatalf("player 2 FinishedAt is nil")
	}
}
