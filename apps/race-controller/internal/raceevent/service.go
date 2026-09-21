package raceevent

import (
	"errors"
	"slices"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidEvent    = errors.New("invalid race event")
	ErrUnsupportedType = errors.New("unsupported race event type")
)

type Service struct {
	mu       sync.RWMutex
	events   []Event
	eventIDs map[string]int
}

func NewService() *Service {
	return &Service{
		events:   make([]Event, 0),
		eventIDs: make(map[string]int),
	}
}

// Recordはイベントを登録します。
// created=falseの場合、同じIDのイベントがすでに登録されています。
func (s *Service) Record(event Event) (recorded Event, created bool, err error) {
	if err := validate(event); err != nil {
		return Event{}, false, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if index, exists := s.eventIDs[event.ID]; exists {
		return cloneEvent(s.events[index]), false, nil
	}

	event.ID = strings.TrimSpace(event.ID)
	event.MatchID = strings.TrimSpace(event.MatchID)
	event.PlayerUUID = strings.TrimSpace(event.PlayerUUID)
	event.PlayerName = strings.TrimSpace(event.PlayerName)
	event.AdvancementKey = strings.TrimSpace(event.AdvancementKey)
	event.OccurredAt = event.OccurredAt.UTC()
	event.ReceivedAt = time.Now().UTC()
	event.Metadata = cloneMetadata(event.Metadata)

	s.eventIDs[event.ID] = len(s.events)
	s.events = append(s.events, event)

	return cloneEvent(event), true, nil
}

func (s *Service) ListByMatch(matchID string) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]Event, 0)

	for _, event := range s.events {
		if event.MatchID == matchID {
			result = append(result, cloneEvent(event))
		}
	}

	slices.SortStableFunc(result, func(left, right Event) int {
		return left.OccurredAt.Compare(right.OccurredAt)
	})

	return result
}

func (s *Service) DeleteByMatch(matchID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	remaining := make([]Event, 0, len(s.events))
	eventIDs := make(map[string]int)

	for _, event := range s.events {
		if event.MatchID == matchID {
			continue
		}

		eventIDs[event.ID] = len(remaining)
		remaining = append(remaining, event)
	}

	s.events = remaining
	s.eventIDs = eventIDs
}

func validate(event Event) error {
	if strings.TrimSpace(event.ID) == "" ||
		strings.TrimSpace(event.MatchID) == "" ||
		event.Slot < 1 ||
		strings.TrimSpace(event.PlayerUUID) == "" ||
		strings.TrimSpace(event.PlayerName) == "" ||
		event.OccurredAt.IsZero() {
		return ErrInvalidEvent
	}

	if !isSupportedType(event.Type) {
		return ErrUnsupportedType
	}

	return nil
}

func isSupportedType(eventType Type) bool {
	switch eventType {
	case TypePlayerJoined,
		TypePlayerQuit,
		TypePlayerDied,
		TypeAdvancementCompleted,
		TypeEnteredNether,
		TypeEnteredEnd,
		TypeDragonDefeated:
		return true
	default:
		return false
	}
}

func cloneEvent(source Event) Event {
	cloned := source
	cloned.Metadata = cloneMetadata(source.Metadata)

	return cloned
}

func cloneMetadata(source map[string]string) map[string]string {
	if source == nil {
		return nil
	}

	cloned := make(map[string]string, len(source))

	for key, value := range source {
		cloned[key] = value
	}

	return cloned
}

func (s *Service) Restore(events []Event) error {
	restoredEvents := make([]Event, 0, len(events))
	restoredEventIDs := make(map[string]int)

	for _, event := range events {
		if err := validate(event); err != nil {
			return err
		}

		event.ID = strings.TrimSpace(event.ID)
		event.MatchID = strings.TrimSpace(event.MatchID)
		event.PlayerUUID = strings.TrimSpace(event.PlayerUUID)
		event.PlayerName = strings.TrimSpace(event.PlayerName)
		event.AdvancementKey =
			strings.TrimSpace(event.AdvancementKey)
		event.OccurredAt = event.OccurredAt.UTC()

		if !event.ReceivedAt.IsZero() {
			event.ReceivedAt = event.ReceivedAt.UTC()
		}

		event.Metadata = cloneMetadata(event.Metadata)

		if _, exists := restoredEventIDs[event.ID]; exists {
			continue
		}

		restoredEventIDs[event.ID] = len(restoredEvents)
		restoredEvents = append(restoredEvents, event)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.events = restoredEvents
	s.eventIDs = restoredEventIDs

	return nil
}
