package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/raceevent"
)

type createMatchRequest struct {
	PlayerCount int `json:"playerCount"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type raceEventsResponse struct {
	Events []raceevent.Event `json:"events"`
}

type RaceServerRepository interface {
	Create(
		ctx context.Context,
		raceMatch *match.Match,
	) error

	Delete(
		ctx context.Context,
		raceMatch *match.Match,
	) error

	WaitUntilReady(
		ctx context.Context,
		raceMatch *match.Match,
	) error
}

type MatchStateStore interface {
	Save(
		ctx context.Context,
		raceMatch *match.Match,
	) error

	Delete(ctx context.Context) error
}

type RaceEventStore interface {
	Save(
		ctx context.Context,
		events []raceevent.Event,
	) error

	Delete(ctx context.Context) error
}

func NewRouter(
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
	matchStateStore MatchStateStore,
	raceEventService *raceevent.Service,
	raceEventStore RaceEventStore,
	raceEventToken string,
) http.Handler {
	mux := http.NewServeMux()
	raceEventMutationMutex := &sync.Mutex{}

	mux.HandleFunc("GET /healthz", healthHandler)

	mux.HandleFunc("POST /api/v1/matches", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		createMatchHandler(
			w,
			r,
			matchService,
			raceServerRepository,
			matchStateStore,
		)
	})

	mux.HandleFunc("GET /api/v1/matches/current", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		currentMatchHandler(w, r, matchService)
	})

	mux.HandleFunc("DELETE /api/v1/matches/current", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		deleteCurrentMatchHandler(
			w,
			r,
			matchService,
			raceServerRepository,
			matchStateStore,
			raceEventService,
			raceEventStore,
		)
	})

	mux.HandleFunc("POST /api/v1/matches/current/start", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		startCurrentMatchHandler(w, r, matchService, matchStateStore)
	})

	mux.HandleFunc("POST /api/v1/internal/race-events", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		createRaceEventHandler(
			w,
			r,
			matchService,
			matchStateStore,
			raceEventService,
			raceEventStore,
			raceEventToken,
			raceEventMutationMutex,
		)
	})

	mux.HandleFunc("GET /api/v1/matches/current/progress", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		currentMatchProgressHandler(
			w,
			r,
			matchService,
			raceEventService,
		)
	})

	mux.HandleFunc("GET /api/v1/matches/current/events", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		currentRaceEventsHandler(
			w,
			r,
			matchService,
			raceEventService,
		)
	})

	return mux
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}

func createMatchHandler(
	w http.ResponseWriter,
	r *http.Request,
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
	matchStateStore MatchStateStore,
) {
	var request createMatchRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: "invalid request body",
		})
		return
	}

	createdMatch, err := matchService.Create(request.PlayerCount)

	switch {
	case errors.Is(err, match.ErrInvalidPlayerCount):
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: err.Error(),
		})
		return

	case errors.Is(err, match.ErrMatchAlreadyActive):
		writeJSON(w, http.StatusConflict, errorResponse{
			Error: err.Error(),
		})
		return

	case err != nil:
		log.Printf("failed to create match: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to create match",
		})
		return
	}

	if err := matchStateStore.Save(
		r.Context(),
		createdMatch,
	); err != nil {
		log.Printf("failed to save match state: %v", err)

		_ = matchService.DeleteCurrent()

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to save match state",
		})
		return
	}

	if err := raceServerRepository.Create(
		r.Context(),
		createdMatch,
	); err != nil {
		log.Printf("failed to provision race servers: %v", err)

		_ = matchService.DeleteCurrent()

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to provision race servers",
		})
		return
	}

	go monitorMatchReadiness(
		createdMatch,
		matchService,
		raceServerRepository,
		matchStateStore,
	)

	writeJSON(w, http.StatusAccepted, createdMatch)
}

func currentMatchHandler(
	w http.ResponseWriter,
	_ *http.Request,
	matchService *match.Service,
) {
	currentMatch, err := matchService.Current()

	if errors.Is(err, match.ErrMatchNotFound) {
		writeJSON(w, http.StatusNotFound, errorResponse{Error: err.Error()})
		return
	}

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to get match",
		})
		return
	}

	writeJSON(w, http.StatusOK, currentMatch)
}

func deleteCurrentMatchHandler(
	w http.ResponseWriter,
	r *http.Request,
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
	matchStateStore MatchStateStore,
	raceEventService *raceevent.Service,
	raceEventStore RaceEventStore,
) {
	currentMatch, err := matchService.Current()
	if errors.Is(err, match.ErrMatchNotFound) {
		writeJSON(w, http.StatusNotFound, errorResponse{
			Error: err.Error(),
		})
		return
	}

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to get current match",
		})
		return
	}

	if err := raceServerRepository.Delete(
		r.Context(),
		currentMatch,
	); err != nil {
		log.Printf("failed to delete race servers: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to delete race servers",
		})
		return
	}

	if err := matchStateStore.Delete(r.Context()); err != nil {
		log.Printf("failed to delete match state: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to delete match state",
		})
		return
	}

	if err := raceEventStore.Delete(
		r.Context(),
	); err != nil {
		log.Printf(
			"failed to delete race event state: %v",
			err,
		)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to delete race event state",
		})
		return
	}

	raceEventService.DeleteByMatch(currentMatch.ID)

	if err := matchService.DeleteCurrent(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to delete match",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("failed to encode response: %v", err)
	}
}

func ResumeMatchMonitoring(
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
	matchStateStore MatchStateStore,
) {
	currentMatch, err := matchService.Current()

	if errors.Is(err, match.ErrMatchNotFound) {
		return
	}

	if err != nil {
		log.Printf(
			"failed to get current match for monitoring: %v",
			err,
		)
		return
	}

	if currentMatch.Status != match.StatusCreating {
		return
	}

	log.Printf(
		"resuming readiness monitoring: match=%s",
		currentMatch.ID,
	)

	go monitorMatchReadiness(
		currentMatch,
		matchService,
		raceServerRepository,
		matchStateStore,
	)
}

func monitorMatchReadiness(
	raceMatch *match.Match,
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
	matchStateStore MatchStateStore,
) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Minute,
	)
	defer cancel()

	err := raceServerRepository.WaitUntilReady(ctx, raceMatch)
	if err != nil {
		log.Printf(
			"race servers failed to become ready: match=%s error=%v",
			raceMatch.ID,
			err,
		)

		if statusErr := matchService.SetStatus(
			raceMatch.ID,
			match.StatusError,
		); statusErr != nil {
			log.Printf(
				"failed to update match status to ERROR: "+
					"match=%s error=%v",
				raceMatch.ID,
				statusErr,
			)
			return
		}

		errorMatch, currentErr := matchService.Current()
		if currentErr != nil {
			log.Printf(
				"failed to get errored match: match=%s error=%v",
				raceMatch.ID,
				currentErr,
			)
			return
		}

		// 元のctxはタイムアウト済みの可能性があるため、新しいContextを使う
		saveContext, saveCancel := context.WithTimeout(
			context.Background(),
			10*time.Second,
		)
		defer saveCancel()

		if saveErr := matchStateStore.Save(
			saveContext,
			errorMatch,
		); saveErr != nil {
			log.Printf(
				"failed to save errored match: match=%s error=%v",
				raceMatch.ID,
				saveErr,
			)
			return
		}

		log.Printf(
			"race match entered error state: match=%s",
			raceMatch.ID,
		)
		return
	}

	if err := matchService.SetStatus(
		raceMatch.ID,
		match.StatusReady,
	); err != nil {
		log.Printf(
			"failed to update match status: match=%s error=%v",
			raceMatch.ID,
			err,
		)
		return
	}

	currentMatch, err := matchService.Current()
	if err != nil {
		log.Printf("failed to get ready match: %v", err)
		return
	}

	if err := matchStateStore.Save(
		context.Background(),
		currentMatch,
	); err != nil {
		log.Printf("failed to save ready match: %v", err)
		return
	}

	log.Printf("race match is ready: match=%s", raceMatch.ID)
}

func startCurrentMatchHandler(
	w http.ResponseWriter,
	_ *http.Request,
	matchService *match.Service,
	matchStateStore MatchStateStore,
) {
	startedMatch, err := matchService.StartCurrent()

	switch {
	case errors.Is(err, match.ErrMatchNotFound):
		writeJSON(w, http.StatusNotFound, errorResponse{
			Error: err.Error(),
		})
		return

	case errors.Is(err, match.ErrMatchNotReady):
		writeJSON(w, http.StatusConflict, errorResponse{
			Error: err.Error(),
		})
		return

	case err != nil:
		log.Printf("failed to start match: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to start match",
		})
		return
	}

	saveContext, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)
	defer cancel()

	if err := matchStateStore.Save(
		saveContext,
		startedMatch,
	); err != nil {
		log.Printf("failed to save running match: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to save running match",
		})
		return
	}

	writeJSON(w, http.StatusOK, startedMatch)
}

func createRaceEventHandler(
	w http.ResponseWriter,
	r *http.Request,
	matchService *match.Service,
	matchStateStore MatchStateStore,
	raceEventService *raceevent.Service,
	raceEventStore RaceEventStore,
	raceEventToken string,
	raceEventMutationMutex *sync.Mutex,
) {
	if !hasValidBearerToken(
		r,
		raceEventToken,
	) {
		writeJSON(w, http.StatusUnauthorized, errorResponse{
			Error: "unauthorized",
		})
		return
	}
	var raceEvent raceevent.Event

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&raceEvent); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: "invalid request body",
		})
		return
	}

	currentMatch, err := matchService.Current()

	if errors.Is(err, match.ErrMatchNotFound) {
		writeJSON(w, http.StatusNotFound, errorResponse{
			Error: err.Error(),
		})
		return
	}

	if err != nil {
		log.Printf("failed to get current match for race event: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to get current match",
		})
		return
	}

	if raceEvent.MatchID != currentMatch.ID {
		writeJSON(w, http.StatusConflict, errorResponse{
			Error: "event match does not match current match",
		})
		return
	}

	if raceEvent.Slot < 1 || raceEvent.Slot > currentMatch.PlayerCount {
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: "event slot is outside the current match",
		})
		return
	}

	raceEventMutationMutex.Lock()
	defer raceEventMutationMutex.Unlock()

	recordedEvent, created, err := raceEventService.Record(raceEvent)

	switch {
	case errors.Is(err, raceevent.ErrInvalidEvent),
		errors.Is(err, raceevent.ErrUnsupportedType):
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: err.Error(),
		})
		return

	case err != nil:
		log.Printf("failed to record race event: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to record race event",
		})
		return
	}

	events := raceEventService.ListByMatch(
		currentMatch.ID,
	)

	if err := raceEventStore.Save(
		r.Context(),
		events,
	); err != nil {
		log.Printf(
			"failed to save race events: match=%s error=%v",
			currentMatch.ID,
			err,
		)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to save race events",
		})
		return
	}

	if raceEvent.Type == raceevent.TypeDragonDefeated {
		progress := raceEventService.Progress(
			currentMatch.ID,
			currentMatch.PlayerCount,
		)

		allPlayersFinished := len(progress.Players) > 0
		var finishedAt time.Time

		for _, playerProgress := range progress.Players {
			if playerProgress.FinishedAt == nil {
				allPlayersFinished = false
				break
			}

			if finishedAt.IsZero() ||
				playerProgress.FinishedAt.After(finishedAt) {
				finishedAt =
					*playerProgress.FinishedAt
			}
		}

		if allPlayersFinished {
			var finishedMatch *match.Match

			switch currentMatch.Status {
			case match.StatusRunning:
				finishedMatch, err =
					matchService.FinishCurrent(
						finishedAt,
					)

			case match.StatusFinished:
				finishedMatch, err =
					matchService.Current()
			}

			if err != nil {
				log.Printf(
					"failed to finish match: match=%s error=%v",
					currentMatch.ID,
					err,
				)

				writeJSON(
					w,
					http.StatusInternalServerError,
					errorResponse{
						Error: "failed to finish match",
					},
				)
				return
			}

			if finishedMatch != nil {
				if err := matchStateStore.Save(
					r.Context(),
					finishedMatch,
				); err != nil {
					log.Printf(
						"failed to save finished match: match=%s error=%v",
						currentMatch.ID,
						err,
					)

					writeJSON(
						w,
						http.StatusInternalServerError,
						errorResponse{
							Error: "failed to save finished match",
						},
					)
					return
				}

				log.Printf(
					"race match is finished: match=%s finishedAt=%s",
					finishedMatch.ID,
					finishedMatch.FinishedAt.Format(
						time.RFC3339Nano,
					),
				)
			}
		}
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}

	writeJSON(w, status, recordedEvent)
}

func currentRaceEventsHandler(
	w http.ResponseWriter,
	_ *http.Request,
	matchService *match.Service,
	raceEventService *raceevent.Service,
) {
	currentMatch, err := matchService.Current()

	if errors.Is(err, match.ErrMatchNotFound) {
		writeJSON(w, http.StatusNotFound, errorResponse{
			Error: err.Error(),
		})
		return
	}

	if err != nil {
		log.Printf("failed to get current match events: %v", err)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to get current match",
		})
		return
	}

	events := raceEventService.ListByMatch(currentMatch.ID)

	writeJSON(w, http.StatusOK, raceEventsResponse{
		Events: events,
	})
}

func currentMatchProgressHandler(
	w http.ResponseWriter,
	_ *http.Request,
	matchService *match.Service,
	raceEventService *raceevent.Service,
) {
	currentMatch, err := matchService.Current()

	if errors.Is(err, match.ErrMatchNotFound) {
		writeJSON(w, http.StatusNotFound, errorResponse{
			Error: err.Error(),
		})
		return
	}

	if err != nil {
		log.Printf(
			"failed to get current match progress: %v",
			err,
		)

		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to get current match",
		})
		return
	}

	progress := raceEventService.Progress(
		currentMatch.ID,
		currentMatch.PlayerCount,
	)

	writeJSON(w, http.StatusOK, progress)
}

func hasValidBearerToken(
	r *http.Request,
	expectedToken string,
) bool {
	const bearerPrefix = "Bearer "

	authorization := strings.TrimSpace(
		r.Header.Get("Authorization"),
	)

	if !strings.HasPrefix(
		authorization,
		bearerPrefix,
	) {
		return false
	}

	providedToken := strings.TrimSpace(
		strings.TrimPrefix(
			authorization,
			bearerPrefix,
		),
	)

	if providedToken == "" {
		return false
	}

	return subtle.ConstantTimeCompare(
		[]byte(providedToken),
		[]byte(expectedToken),
	) == 1
}
