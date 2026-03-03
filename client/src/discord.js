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
        console.log("No SDK instance found (likely not embedded). Returning local room fallback.");
        return 'local-browser-room';
    }

    console.log("SDK Instance exists. Waiting for ready...");

    // Add a timeout so we don't hang forever if Discord never signals ready
    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SDK Ready Timeout")), 5000));

    try {
        await Promise.race([readyPromise, timeoutPromise]);
        console.log("SDK is ready.");
    } catch (err) {
        console.error("SDK Failed to become ready:", err);
        throw err; // Let App.jsx catch it and show the error UI
    }

    // If we are actually running inside Discord:
    if (discordSdk.channelId != null) {
        console.log("Running in channel:", discordSdk.channelId);
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
