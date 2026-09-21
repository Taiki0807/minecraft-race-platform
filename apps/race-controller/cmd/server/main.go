package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/httpapi"
	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/kube"
	"github.com/Taiki0807/minecraft-race-platform/apps/race-controller/internal/match"
)

func main() {
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
