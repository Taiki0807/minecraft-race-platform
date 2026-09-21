package dev.hosokawa.minecraft.race;

import com.google.gson.Gson;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.logging.Logger;

final class RaceEventClient {

    private static final String EVENT_PATH =
        "/api/v1/internal/race-events";

    private final HttpClient httpClient;
    private final URI eventEndpoint;
    private final Gson gson;
    private final String eventToken;
    private final Logger logger;

    RaceEventClient(
        String controllerBaseURL,
        String eventToken,
        Logger logger
    ) {
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

        this.eventEndpoint = URI.create(controllerBaseURL)
            .resolve(EVENT_PATH);

        this.gson = new Gson();
        this.eventToken = eventToken;
        this.logger = logger;
    }

    void send(RaceEventPayload event) {
        String requestBody = gson.toJson(event);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(eventEndpoint)
            .timeout(Duration.ofSeconds(5))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + eventToken)
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .build();

        httpClient.sendAsync(
            request,
            HttpResponse.BodyHandlers.ofString()
        ).whenComplete((response, error) -> {
            if (error != null) {
                logger.warning(
                    "Failed to send race event: id=%s error=%s"
                        .formatted(event.id(), error.getMessage())
                );
                return;
            }

            int statusCode = response.statusCode();

            if (statusCode != 200 && statusCode != 201) {
                logger.warning(
                    "Race event was rejected: id=%s status=%d body=%s"
                        .formatted(
                            event.id(),
                            statusCode,
                            response.body()
                        )
                );
                return;
            }

            logger.info(
                "Race event sent: id=%s type=%s status=%d"
                    .formatted(
                        event.id(),
                        event.type(),
                        statusCode
                    )
            );
        });
    }
}
