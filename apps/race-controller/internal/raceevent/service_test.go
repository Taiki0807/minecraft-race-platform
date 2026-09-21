package raceevent

import (
	"errors"
	"testing"
	"time"
)

func TestServiceRecordAndListByMatch(t *testing.T) {
	service := NewService()

	later := time.Date(2026, 9, 21, 5, 30, 0, 0, time.UTC)
	earlier := later.Add(-time.Minute)

	events := []Event{
		{
			ID:         "event-2",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypeEnteredNether,
			OccurredAt: later,
		},
		{
			ID:         "event-1",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypePlayerJoined,
			OccurredAt: earlier,
		},
	}

	for _, event := range events {
		recorded, created, err := service.Record(event)
		if err != nil {
			t.Fatalf("Record() error = %v", err)
		}

		if !created {
			t.Fatalf("Record() created = false, want true")
		}

		if recorded.ReceivedAt.IsZero() {
			t.Fatalf("Record() ReceivedAt is zero")
		}
	}

	got := service.ListByMatch("match-1")

	if len(got) != 2 {
		t.Fatalf("ListByMatch() length = %d, want 2", len(got))
	}

	if got[0].ID != "event-1" {
		t.Errorf("first event ID = %q, want event-1", got[0].ID)
	}

	if got[1].ID != "event-2" {
		t.Errorf("second event ID = %q, want event-2", got[1].ID)
	}
}

func TestServiceRecordIsIdempotent(t *testing.T) {
	service := NewService()

	event := Event{
		ID:         "same-event",
		MatchID:    "match-1",
		Slot:       1,
		PlayerUUID: "player-uuid",
		PlayerName: "Gonzales2",
		Type:       TypePlayerJoined,
		OccurredAt: time.Now().UTC(),
	}

	_, created, err := service.Record(event)
	if err != nil {
		t.Fatalf("first Record() error = %v", err)
	}

	if !created {
		t.Fatalf("first Record() created = false, want true")
	}

	_, created, err = service.Record(event)
	if err != nil {
		t.Fatalf("second Record() error = %v", err)
	}

	if created {
		t.Fatalf("second Record() created = true, want false")
	}

	got := service.ListByMatch("match-1")

	if len(got) != 1 {
		t.Fatalf("ListByMatch() length = %d, want 1", len(got))
	}
}

func TestServiceRejectsInvalidEvent(t *testing.T) {
	service := NewService()

	_, _, err := service.Record(Event{})

	if !errors.Is(err, ErrInvalidEvent) {
		t.Fatalf("Record() error = %v, want ErrInvalidEvent", err)
	}
}

func TestServiceDeleteByMatch(t *testing.T) {
	service := NewService()

	for _, matchID := range []string{"match-1", "match-2"} {
		_, _, err := service.Record(Event{
			ID:         "event-" + matchID,
			MatchID:    matchID,
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypePlayerJoined,
			OccurredAt: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Record() error = %v", err)
		}
	}

	service.DeleteByMatch("match-1")

	if got := service.ListByMatch("match-1"); len(got) != 0 {
		t.Fatalf("match-1 events length = %d, want 0", len(got))
	}

	if got := service.ListByMatch("match-2"); len(got) != 1 {
		t.Fatalf("match-2 events length = %d, want 1", len(got))
	}
}

func TestServiceRestore(t *testing.T) {
	service := NewService()

	occurredAt := time.Date(
		2026,
		9,
		21,
		7,
		0,
		0,
		0,
		time.UTC,
	)

	receivedAt := occurredAt.Add(time.Second)

	events := []Event{
		{
			ID:         "restored-event",
			MatchID:    "match-1",
			Slot:       1,
			PlayerUUID: "player-uuid",
			PlayerName: "Gonzales2",
			Type:       TypePlayerJoined,
			OccurredAt: occurredAt,
			ReceivedAt: receivedAt,
		},
	}

	if err := service.Restore(events); err != nil {
		t.Fatalf("Restore() error = %v", err)
	}

	got := service.ListByMatch("match-1")

	if len(got) != 1 {
		t.Fatalf(
			"ListByMatch() length = %d, want 1",
			len(got),
		)
	}

	if got[0].ID != "restored-event" {
		t.Errorf(
			"event ID = %q, want restored-event",
			got[0].ID,
		)
	}

	if !got[0].ReceivedAt.Equal(receivedAt) {
		t.Errorf(
			"ReceivedAt = %v, want %v",
			got[0].ReceivedAt,
			receivedAt,
		)
	}
}
