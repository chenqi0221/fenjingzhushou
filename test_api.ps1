$headers = @{
    'Content-Type' = 'application/json'
    'Authorization' = 'Bearer 8e72cdd7-cfc1-42ef-a504-ff18f4683712'
}
$body = @{
    model = 'ep-20260409133015-wmlmk'
    prompt = 'a cute cat'
    size = '2048x2048'
    n = 1
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri 'https://ark.cn-beijing.volces.com/api/v3/images/generations' -Method Post -Headers $headers -Body $body
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_"
    Write-Host "Response: $_"
}
