Start-Process -FilePath "cloudflared.exe" -ArgumentList "tunnel --url http://localhost:5173" -NoNewWindow -Wait -RedirectStandardError "cloudflare.log"
