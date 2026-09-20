package match

import (
	"errors"
	"strings"
	"testing"
)

func TestServiceCreate(t *testing.T) {
	service := NewService()

	createdMatch, err := service.Create(2)
	if err != nil {
		t.Fatalf("Create() returned error: %v", err)
	}

	if createdMatch.ID == "" {
		t.Error("match ID must not be empty")
	}

	if createdMatch.Seed < 0 {
		t.Errorf("seed must not be negative: %d", createdMatch.Seed)
	}

	if createdMatch.Status != StatusCreating {
		t.Errorf(
			"status = %q, want %q",
			createdMatch.Status,
			StatusCreating,
		)
	}

	if createdMatch.PlayerCount != 2 {
		t.Errorf(
			"player count = %d, want 2",
			createdMatch.PlayerCount,
		)
	}

	if len(createdMatch.Players) != 2 {
		t.Fatalf(
			"players length = %d, want 2",
			len(createdMatch.Players),
		)
	}

	for index, player := range createdMatch.Players {
		expectedSlot := index + 1

		if player.Slot != expectedSlot {
			t.Errorf(
				"player slot = %d, want %d",
				player.Slot,
				expectedSlot,
			)
		}

		if !strings.Contains(player.Address, createdMatch.ID) {
			t.Errorf(
				"address %q does not contain match ID %q",
				player.Address,
				createdMatch.ID,
			)
		}
	}
}

func TestServiceCreateRejectsInvalidPlayerCount(t *testing.T) {
	tests := []struct {
		name        string
		playerCount int
	}{
		{
			name:        "zero players",
			playerCount: 0,
		},
		{
			name:        "more than two players",
			playerCount: 3,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := NewService()

			_, err := service.Create(test.playerCount)

			if !errors.Is(err, ErrInvalidPlayerCount) {
				t.Errorf(
					"Create() error = %v, want %v",
					err,
					ErrInvalidPlayerCount,
				)
			}
		})
	}
}

func TestServiceRejectsSecondActiveMatch(t *testing.T) {
	service := NewService()

	if _, err := service.Create(2); err != nil {
		t.Fatalf("first Create() returned error: %v", err)
	}

	_, err := service.Create(2)

	if !errors.Is(err, ErrMatchAlreadyActive) {
		t.Errorf(
			"second Create() error = %v, want %v",
			err,
			ErrMatchAlreadyActive,
		)
	}
}

func TestServiceDeleteCurrent(t *testing.T) {
	service := NewService()

	createdMatch, err := service.Create(2)
	if err != nil {
		t.Fatalf("Create() returned error: %v", err)
	}

	if err := service.DeleteCurrent(); err != nil {
		t.Fatalf("DeleteCurrent() returned error: %v", err)
	}

	_, err = service.Current()

	if !errors.Is(err, ErrMatchNotFound) {
		t.Errorf(
			"Current() error = %v, want %v",
			err,
			ErrMatchNotFound,
		)
	}

	nextMatch, err := service.Create(2)
	if err != nil {
		t.Fatalf("second Create() returned error: %v", err)
	}

	if nextMatch.ID == createdMatch.ID {
		t.Error("new match must have a different ID")
	}
}

func TestServiceDeleteWithoutMatch(t *testing.T) {
	service := NewService()

	err := service.DeleteCurrent()

	if !errors.Is(err, ErrMatchNotFound) {
		t.Errorf(
			"DeleteCurrent() error = %v, want %v",
			err,
			ErrMatchNotFound,
		)
	}
}
