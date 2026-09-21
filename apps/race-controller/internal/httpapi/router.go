package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
)

type createMatchRequest struct {
	PlayerCount int `json:"playerCount"`
}

type errorResponse struct {
	Error string `json:"error"`
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

func NewRouter(
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
	matchStateStore MatchStateStore,
) http.Handler {
	mux := http.NewServeMux()

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
		)
	})

	mux.HandleFunc("POST /api/v1/matches/current/start", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		startCurrentMatchHandler(w, r, matchService, matchStateStore)
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

		_ = matchService.SetStatus(
			raceMatch.ID,
			match.StatusError,
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
