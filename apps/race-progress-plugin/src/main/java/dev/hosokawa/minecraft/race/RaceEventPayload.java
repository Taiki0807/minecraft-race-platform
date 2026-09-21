package dev.hosokawa.minecraft.race;

import java.util.Map;

record RaceEventPayload(
    String id,
    String matchId,
    int slot,
    String playerUuid,
    String playerName,
    String type,
    String advancementKey,
    String occurredAt,
    Map<String, String> metadata
) {
}
