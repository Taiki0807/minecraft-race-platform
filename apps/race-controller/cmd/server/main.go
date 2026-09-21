package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/httpapi"
	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/kube"
	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/raceevent"
)

func main() {
	raceEventToken := strings.TrimSpace(
		os.Getenv("RACE_EVENT_TOKEN"),
	)

	if raceEventToken == "" {
		log.Fatal("RACE_EVENT_TOKEN is required")
	}

	kubernetesClient, err := kube.NewClient()
	if err != nil {
		log.Fatalf("failed to initialize Kubernetes client: %v", err)
	}

	serverVersion, err := kubernetesClient.Discovery().ServerVersion()
	if err != nil {
		log.Fatalf("failed to get Kubernetes server version: %v", err)
	}

	log.Printf("Connected to Kubernetes %s", serverVersion.GitVersion)

	matchService := match.NewService()
	raceEventService := raceevent.NewService()

	raceEventStore := kube.NewRaceEventStore(
		kubernetesClient,
		"minecraft-race",
	)

	matchStateStore := kube.NewMatchStore(
		kubernetesClient,
		"minecraft-race",
	)

	storedMatch, err := matchStateStore.Load(context.Background())

	switch {
	case err == nil:
		if err := matchService.Restore(storedMatch); err != nil {
			log.Fatalf("failed to restore match: %v", err)
		}

		log.Printf(
			"Restored match state: match=%s status=%s",
			storedMatch.ID,
			storedMatch.Status,
		)

	case errors.Is(err, kube.ErrMatchStateNotFound):
		log.Printf("No stored match state found")

	default:
		log.Fatalf("failed to load match state: %v", err)
	}
	storedEvents, err := raceEventStore.Load(
		context.Background(),
	)

	switch {
	case err == nil:
		if err := raceEventService.Restore(
			storedEvents,
		); err != nil {
			log.Fatalf(
				"failed to restore race events: %v",
				err,
			)
		}

		log.Printf(
			"Restored race events: count=%d",
			len(storedEvents),
		)

	case errors.Is(err, kube.ErrRaceEventsNotFound):
		log.Printf("No stored race events found")

	default:
		log.Fatalf(
			"failed to load race events: %v",
			err,
		)
	}

	raceServerRepository := kube.NewRaceServerRepository(
		kubernetesClient,
		"minecraft-race",
	)

	httpapi.ResumeMatchMonitoring(
		matchService,
		raceServerRepository,
		matchStateStore,
	)

	router := httpapi.NewRouter(
		matchService,
		raceServerRepository,
		matchStateStore,
		raceEventService,
		raceEventStore,
		raceEventToken,
	)

	server := &http.Server{
		Addr:              ":8080",
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Race Controller API started on http://localhost%s", server.Addr)

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
