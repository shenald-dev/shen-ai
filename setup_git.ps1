$headers = @{
    "Authorization" = "token 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"
    "Accept" = "application/vnd.github.v3+json"
}
$body = @{
    name = "shen-ai"
    description = "SHEN AI - Autonomous Coding Agent. A superior multi-agent, multi-provider AI coding assistant that thinks ahead, learns from you, and builds autonomously."
    private = $false
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Repository created successfully."
} catch {
    Write-Host "Repository might already exist or creation failed."
    Write-Host $_.Exception.Message
}

git init
git checkout -b main
git add .
git commit -m "Initial commit with awesome README and AI logo"
git remote add origin https://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@github.com/shenald-dev/shen-ai.git
git push -u origin main
