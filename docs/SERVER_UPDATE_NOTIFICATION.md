# Server Update Notification System

This feature allows administrators to notify all connected clients to refresh their pages when a server update is being deployed. This ensures users get the latest version of the application without having to manually refresh.

## API Endpoint

### `POST /admin/notify-update`

Triggers a server update notification to all connected clients across all lobbies.

#### Request Body (Optional JSON)

```json
{
    "message": "Custom message to display to users",
    "delay_seconds": 10
}
```

**Parameters:**
- `message` (optional): Custom message to display to users. Default: "Server is being updated. Please save your progress."
- `delay_seconds` (optional): How long to wait before refreshing the page (1-60 seconds). Default: 5

#### Response

```json
{
    "status": "ok",
    "message": "Server is being updated. Please save your progress.",
    "delay_seconds": 5,
    "lobbies_notified": 3
}
```

#### Error Response

```json
{
    "status": "error",
    "msg": "delay_seconds must be an integer between 1 and 60"
}
```

## Usage Examples

### Basic Usage (Default Settings)
```bash
curl -X POST http://localhost:5001/admin/notify-update
```

### Custom Message and Delay
```bash
curl -X POST -H "Content-Type: application/json" \
  http://localhost:5001/admin/notify-update \
  -d '{"message": "Deploying new features! Refreshing in 10 seconds.", "delay_seconds": 10}'
```

### Integration with Deployment Scripts

```bash
#!/bin/bash
# Deploy script example

echo "Starting deployment..."

# Notify users of upcoming refresh
curl -X POST -H "Content-Type: application/json" \
  http://your-server.com/admin/notify-update \
  -d '{"message": "New version deploying. Page will refresh automatically.", "delay_seconds": 15}'

# Wait a moment for notification to be sent
sleep 2

# Deploy new version
docker-compose up -d --no-deps web

echo "Deployment complete!"
```

## How It Works

1. **Server-Side Broadcasting**: The `/admin/notify-update` endpoint broadcasts a special SSE message to all connected clients across all lobbies
2. **Client-Side Handling**: The frontend JavaScript detects server update messages and displays them to users
3. **Automatic Refresh**: After the specified delay, the page automatically refreshes to load the new version
4. **Graceful Degradation**: If there are any errors, fallback mechanisms ensure the refresh still occurs

## Technical Implementation

### Backend (Python/Flask)
- New function `broadcast_server_update_notification()` sends update messages to all lobby listeners
- Admin endpoint `/admin/notify-update` validates parameters and triggers the broadcast
- Uses existing SSE infrastructure with message type differentiation

### Frontend (JavaScript)
- Modified SSE message handler to detect `server_update` message type
- New function `handleServerUpdateNotification()` displays message and schedules refresh
- Enhanced error handling and logging for debugging

## Benefits

- **Zero-downtime deployments**: Users automatically get the latest version
- **User-friendly**: Clear notification before refresh happens
- **Configurable**: Customizable message and delay timing
- **Robust**: Built on existing SSE infrastructure
- **Minimal impact**: Leverages existing code with minimal changes

## Testing

Run the test suite to verify functionality:

```bash
python -m pytest tests/test_server_update_notification.py -v
```

## Security Considerations

- The `/admin/notify-update` endpoint should be protected in production (add authentication/authorization)
- Consider rate limiting to prevent abuse
- Monitor logs for unexpected usage patterns