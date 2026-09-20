package main

import (
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

	raceServerRepository := kube.NewRaceServerRepository(
		kubernetesClient,
		"minecraft-race",
	)

	router := httpapi.NewRouter(
		matchService,
		raceServerRepository,
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
