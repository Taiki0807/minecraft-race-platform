package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

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
}

func NewRouter(
	matchService *match.Service,
	raceServerRepository RaceServerRepository,
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
