# Returning Users Feature

This document describes the functionality for returning users to access their existing game servers.

## Overview

Users can now view their existing servers by clicking the "View Existing Server" button instead of only creating new ones. This prevents confusion when a server already exists and allows users to easily retrieve their server details and view logs.

## Backend Changes

### New Endpoint: `GET /gameserver/{user_id}`

Returns information about an existing server for a given user.

**Response (200 OK):**
```json
{
  "namespace": "server-testuser",
  "ip": "192.168.1.100",
  "port": 25565,
  "status": "ready"
}
```

**Error Responses:**
- `404 Not Found`: No server exists for this user
- `500 Internal Server Error`: Server or namespace issue

**Location:** `backend/main.py:148`

## Frontend Changes

### New Function: `getExistingServer()`

Fetches existing server information for the current user ID.

**Features:**
- Shows loading state while fetching
- Displays server details (IP, port, status)
- Provides access to view logs
- Clear error messages if server not found

**Location:** `frontend/app/page.tsx:101`

### Updated UI

**Two Button Layout:**

1. **Create New** (Left Button)
   - Creates a new server for the user ID
   - Shows error if server already exists with helpful message
   - Purple/indigo gradient styling

2. **View Existing** (Right Button)
   - Retrieves existing server information
   - Shows error if no server found
   - Slate/gray styling to differentiate from create action

Both buttons are side-by-side in a grid layout for easy access.

## User Flows

### Flow 1: New User Creating Server

1. User enters user ID
2. Clicks "Create New"
3. Server is provisioned
4. Server details displayed (IP, port, status)
5. User can view logs

### Flow 2: Returning User (Server Exists)

1. User enters user ID
2. Clicks "View Existing"
3. Server details retrieved and displayed
4. User can view logs immediately

### Flow 3: Existing User Tries to Create Again

1. User enters user ID of existing server
2. Clicks "Create New"
3. Error message: "Server for user 'X' already exists. Click 'View Existing Server' to access it."
4. User clicks "View Existing"
5. Server details displayed

### Flow 4: New User Tries to View Non-Existent Server

1. User enters user ID
2. Clicks "View Existing"
3. Error message: "No server found for user 'X'. Create a new server to get started."
4. User clicks "Create New"
5. Server is created

## Testing

### Test Creating a New Server

```bash
curl -X POST "http://localhost:8000/gameserver?user_id=testuser&game=minecraft&memory=2G"
```

### Test Viewing Existing Server

```bash
curl http://localhost:8000/gameserver/testuser
```

Expected response if server exists:
```json
{
  "namespace": "server-testuser",
  "ip": "192.168.1.100",
  "port": 25565,
  "status": "ready"
}
```

Expected response if server doesn't exist:
```json
{
  "detail": "No server found for user 'testuser'"
}
```

## Benefits

1. **Better UX**: Users can easily access existing servers without confusion
2. **Clear Actions**: Two distinct buttons for different actions
3. **Error Prevention**: Clear error messages guide users to correct action
4. **Quick Access**: Returning users can jump straight to logs
5. **Flexibility**: Users can choose to create new or view existing

## Future Enhancements

Potential improvements:
- Auto-detect if server exists when user enters ID
- Server management page (start/stop/delete)
- Multiple server support per user
- Server status indicators before clicking
