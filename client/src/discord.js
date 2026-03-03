import { DiscordSDK } from "@discord/embedded-app-sdk";

let sdkInstance = null;

try {
    // This throws if frame_id query param is missing (i.e., not embedded in Discord)
    sdkInstance = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID || 'dummy-client-id');
} catch (e) {
    console.warn("Could not initialize Discord SDK. Running in local browser mode.", e.message);
}

export const discordSdk = sdkInstance;

export async function setupDiscordSdk() {
    if (!discordSdk) {
        return 'local-browser-room';
    }

    await discordSdk.ready();

    // If we are actually running inside Discord:
    if (discordSdk.channelId != null) {
        try {
            const { code } = await discordSdk.commands.authorize({
                client_id: import.meta.env.VITE_DISCORD_CLIENT_ID || 'dummy-client-id',
                response_type: "code",
                state: "",
                prompt: "none",
                scope: ["identify", "guilds"],
            });
            // We could authenticate here, but for simple syncing the channelId is enough
        } catch (e) {
            console.error("Discord SDK Authorize failed", e);
        }
    }

    return discordSdk.channelId || 'test-room';
}
