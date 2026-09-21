package dev.hosokawa.minecraft.race;

import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;


import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class RaceProgressPlugin
    extends JavaPlugin
    implements Listener {

    private String matchId;
    private int playerSlot;
    private RaceEventClient eventClient;

    @Override
    public void onEnable() {
        try {
            matchId = requireEnvironment("RACE_MATCH_ID");
            playerSlot = parsePlayerSlot(
                requireEnvironment("RACE_PLAYER_SLOT")
            );

            String controllerURL =
                requireEnvironment("RACE_CONTROLLER_URL");
            
            String eventToken =
                requireEnvironment("RACE_EVENT_TOKEN");

            eventClient = new RaceEventClient(
                controllerURL,
                eventToken,
                getLogger()
            );
        } catch (IllegalArgumentException error) {
            getLogger().severe(
                "Failed to configure Race Progress Plugin: "
                    + error.getMessage()
            );

            getServer()
                .getPluginManager()
                .disablePlugin(this);

            return;
        }

        getServer()
            .getPluginManager()
            .registerEvents(this, this);

        getLogger().info(
            "Race Progress Plugin enabled: match=%s slot=%d"
                .formatted(matchId, playerSlot)
        );
    }

    @Override
    public void onDisable() {
        getLogger().info("Race Progress Plugin disabled");
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();

        getLogger().info(
            "Player joined: name=%s uuid=%s"
                .formatted(
                    player.getName(),
                    player.getUniqueId()
                )
        );

        sendEvent(
            UUID.randomUUID().toString(),
            player,
            "PLAYER_JOINED",
            null,
            Map.of()
        );
    }

    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();

        getLogger().info(
            "Player died: name=%s uuid=%s"
                .formatted(
                    player.getName(),
                    player.getUniqueId()
                )
        );

        sendEvent(
            UUID.randomUUID().toString(),
            player,
            "PLAYER_DIED",
            null,
            Map.of(
                "world", player.getWorld().getName()
            )
        );
    }

    @EventHandler
    public void onPlayerChangedWorld(
        PlayerChangedWorldEvent event
    ) {
        Player player = event.getPlayer();
        World destination = player.getWorld();

        String eventType;

        switch (destination.getEnvironment()) {
            case NETHER -> eventType = "ENTERED_NETHER";
            case THE_END -> eventType = "ENTERED_END";
            default -> {
                return;
            }
        }

        String eventID = "%s-%d-%s-%s".formatted(
            matchId,
            playerSlot,
            player.getUniqueId(),
            eventType
        );

        getLogger().info(
            "Player changed dimension: name=%s from=%s to=%s event=%s"
                .formatted(
                    player.getName(),
                    event.getFrom().getName(),
                    destination.getName(),
                    eventType
                )
        );

        sendEvent(
            eventID,
            player,
            eventType,
            null,
            Map.of(
                "fromWorld", event.getFrom().getName(),
                "toWorld", destination.getName()
            )
        );
    }

    @EventHandler
    public void onPlayerAdvancementDone(
        PlayerAdvancementDoneEvent event
    ) {
        String advancementKey = event.getAdvancement()
            .getKey()
            .toString();

        // レシピ解放はレース進捗として不要なので送信しない
        if (advancementKey.startsWith("minecraft:recipes/")) {
            return;
        }

        Player player = event.getPlayer();

        String eventID = "%s-%d-%s-ADVANCEMENT-%s".formatted(
            matchId,
            playerSlot,
            player.getUniqueId(),
            advancementKey
        );

        getLogger().info(
            "Player advancement completed: name=%s advancement=%s"
                .formatted(
                    player.getName(),
                    advancementKey
                )
        );

        sendEvent(
            eventID,
            player,
            "ADVANCEMENT_COMPLETED",
            advancementKey,
            Map.of()
        );
        if (
            advancementKey.equals(
                "minecraft:end/kill_dragon"
            )
        ) {
            String dragonEventID =
                "%s-%d-%s-DRAGON_DEFEATED".formatted(
                    matchId,
                    playerSlot,
                    player.getUniqueId()
                );

            sendEvent(
                dragonEventID,
                player,
                "DRAGON_DEFEATED",
                advancementKey,
                Map.of()
            );
        }
    }

    private void sendEvent(
        String eventID,
        Player player,
        String eventType,
        String advancementKey,
        Map<String, String> metadata
    ) {
        RaceEventPayload payload = new RaceEventPayload(
            eventID,
            matchId,
            playerSlot,
            player.getUniqueId().toString(),
            player.getName(),
            eventType,
            advancementKey,
            Instant.now().toString(),
            metadata
        );

        eventClient.send(payload);
    }

    private String requireEnvironment(String name) {
        String value = System.getenv(name);

        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                "environment variable %s is required"
                    .formatted(name)
            );
        }

        return value.trim();
    }

    private int parsePlayerSlot(String value) {
        try {
            int slot = Integer.parseInt(value);

            if (slot < 1) {
                throw new IllegalArgumentException(
                    "RACE_PLAYER_SLOT must be greater than zero"
                );
            }

            return slot;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(
                "RACE_PLAYER_SLOT must be an integer",
                error
            );
        }
    }
}
