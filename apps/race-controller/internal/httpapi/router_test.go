package httpapi

import (
	"context"
	"errors"
	"testing"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
)

type failingRaceServerRepository struct{}

func (r *failingRaceServerRepository) Create(
	_ context.Context,
	_ *match.Match,
) error {
	return nil
}

func (r *failingRaceServerRepository) Delete(
	_ context.Context,
	_ *match.Match,
) error {
	return nil
}

func (r *failingRaceServerRepository) WaitUntilReady(
	_ context.Context,
	_ *match.Match,
) error {
	return errors.New("forced readiness failure")
}

type recordingMatchStateStore struct {
	savedMatch *match.Match
}

func (s *recordingMatchStateStore) Save(
	_ context.Context,
	raceMatch *match.Match,
) error {
	s.savedMatch = raceMatch
	return nil
}

func (s *recordingMatchStateStore) Delete(
	_ context.Context,
) error {
	return nil
}

func TestMonitorMatchReadinessPersistsError(t *testing.T) {
	matchService := match.NewService()

	createdMatch, err := matchService.Create(2)
	if err != nil {
		t.Fatalf("failed to create match: %v", err)
	}

	raceServerRepository := &failingRaceServerRepository{}
	matchStateStore := &recordingMatchStateStore{}

	monitorMatchReadiness(
		createdMatch,
		matchService,
		raceServerRepository,
		matchStateStore,
	)

	currentMatch, err := matchService.Current()
	if err != nil {
		t.Fatalf("failed to get current match: %v", err)
	}

	if currentMatch.Status != match.StatusError {
		t.Fatalf(
			"expected in-memory status %q, got %q",
			match.StatusError,
			currentMatch.Status,
		)
	}

	if matchStateStore.savedMatch == nil {
		t.Fatal("expected errored match to be saved")
	}

	if matchStateStore.savedMatch.Status != match.StatusError {
		t.Fatalf(
			"expected saved status %q, got %q",
			match.StatusError,
			matchStateStore.savedMatch.Status,
		)
	}

	if matchStateStore.savedMatch.ID != createdMatch.ID {
		t.Fatalf(
			"expected saved match ID %q, got %q",
			createdMatch.ID,
			matchStateStore.savedMatch.ID,
		)
	}
}
