package match

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"sync"
)

var (
	ErrInvalidPlayerCount = errors.New("player count must be between 1 and 2")
	ErrMatchAlreadyActive = errors.New("a match is already active")
	ErrMatchNotFound      = errors.New("match not found")
)

type Service struct {
	mu      sync.RWMutex
	current *Match
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) Create(playerCount int) (*Match, error) {
	if playerCount < 1 || playerCount > 2 {
		return nil, ErrInvalidPlayerCount
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current != nil {
		return nil, ErrMatchAlreadyActive
	}

	matchID, err := generateID()
	if err != nil {
		return nil, fmt.Errorf("generate match ID: %w", err)
	}

	seed, err := generateSeed()
	if err != nil {
		return nil, fmt.Errorf("generate seed: %w", err)
	}

	players := make([]Player, 0, playerCount)

	for slot := 1; slot <= playerCount; slot++ {
		players = append(players, Player{
			Slot: slot,
			Address: fmt.Sprintf(
				"p%d-%s.race.hosokawa-lab.dev:25566",
				slot,
				matchID,
			),
		})
	}

	createdMatch := &Match{
		ID:          matchID,
		Seed:        seed,
		Status:      StatusCreating,
		PlayerCount: playerCount,
		Players:     players,
	}

	s.current = createdMatch

	return createdMatch, nil
}

func (s *Service) Current() (*Match, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.current == nil {
		return nil, ErrMatchNotFound
	}

	return s.current, nil
}

func (s *Service) DeleteCurrent() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		return ErrMatchNotFound
	}

	s.current = nil

	return nil
}

func generateID() (string, error) {
	randomBytes := make([]byte, 5)

	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}

	return hex.EncodeToString(randomBytes), nil
}

func generateSeed() (int64, error) {
	randomBytes := make([]byte, 8)

	if _, err := rand.Read(randomBytes); err != nil {
		return 0, err
	}

	seed := int64(binary.BigEndian.Uint64(randomBytes) & math.MaxInt64)

	return seed, nil
}
