import { DiscordSDK } from "@discord/embedded-app-sdk";

let sdkInstance = null;

try {
    sdkInstance = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID || 'dummy-client-id');
} catch (e) {
    console.warn("Could not initialize Discord SDK. Running in local browser mode.", e.message);
}

export const discordSdk = sdkInstance;

/**
 * Set up the Discord SDK and return { roomId, user }.
 * `user` contains { id, username, globalName, avatarUrl }.
 */
export async function setupDiscordSdk() {
    if (!discordSdk) {
        console.log("No SDK instance found (likely not embedded). Returning local room fallback.");
        return {
            roomId: 'local-browser-room',
            user: createFallbackUser(),
        };
    }

    console.log("SDK Instance exists. Waiting for ready...");

    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SDK Ready Timeout")), 5000));

    try {
        await Promise.race([readyPromise, timeoutPromise]);
        console.log("SDK is ready.");
    } catch (err) {
        console.error("SDK Failed to become ready:", err);
        throw err;
    }

    let user = createFallbackUser();

    // If running inside Discord, authorize and fetch user info
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

            // Exchange the code for an access token via our server
            const tokenRes = await fetch('/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const tokenData = await tokenRes.json();

            if (tokenData.access_token) {
                // Fetch user profile from Discord
                const userRes = await fetch('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` },
                });
                const userData = await userRes.json();

                if (userData.id) {
                    const avatarUrl = userData.avatar
                        ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=64`
                        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(userData.id) >> 22n) % 6n}.png`;

                    user = {
                        id: userData.id,
                        username: userData.username,
                        globalName: userData.global_name || userData.username,
                        avatarUrl,
                    };
                    console.log("Discord user loaded:", user.globalName);
                }
            }
        } catch (e) {
            console.error("Discord SDK Authorize/Token failed, using fallback:", e);
        }
    }

    return {
        roomId: discordSdk.channelId || 'test-room',
        user,
    };
}

/** Generate a fallback user for local browser testing. */
function createFallbackUser() {
    const colors = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245'];
    const id = Math.random().toString(36).substring(2, 10);
    return {
        id,
        username: `user-${id.slice(0, 4)}`,
        globalName: `User ${id.slice(0, 4)}`,
        avatarUrl: null, // Will use a colored circle fallback
        color: colors[Math.floor(Math.random() * colors.length)],
    };
}
