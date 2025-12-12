# Redis Configuration for Sales Synchronization

Add these environment variables to your `.env.local` file:

```bash
# Redis Configuration
# Option 1: Use Redis URL (recommended for cloud services like Upstash, Redis Labs)
REDIS_URL="redis://localhost:6379"

# Option 2: Use individual settings (for custom configurations)
# REDIS_HOST="localhost"
# REDIS_PORT="6379"
# REDIS_PASSWORD=""
# REDIS_DB="0"
# REDIS_TLS="false"

# Redis Features
REDIS_ENABLED="true"          # Set to "false" to disable Redis and use direct PostgreSQL saves
REDIS_QUEUE_TTL="86400"       # Queue TTL in seconds (default: 24 hours)
```

## For Production (Vercel/Cloud)

### Option 1: Upstash Redis (Recommended for Vercel)
1. Create account at https://upstash.com
2. Create a Redis database
3. Copy the `REDIS_URL` from dashboard
4. Add to Vercel environment variables

### Option 2: Redis Labs/Cloud
1. Set up Redis instance
2. Get connection URL
3. Add `REDIS_URL` to environment

### Option 3: Self-hosted Redis
1. Deploy Redis container/server
2. Configure connection details
3. If using TLS, set `REDIS_TLS="true"`

## For Local Development

### Using Docker:
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

### Using Homebrew (Mac):
```bash
brew install redis
brew services start redis
```

### Using APT (Linux):
```bash
sudo apt install redis-server
sudo systemctl start redis
```

## Testing Redis Connection

After adding environment variables, restart your dev server and check the logs for:
```
[Redis] ✅ Connected successfully
[Redis] ✅ Ready to accept commands
```

## Fallback Behavior

If Redis is unavailable or `REDIS_ENABLED=false`:
- System automatically falls back to direct PostgreSQL saves
- No data loss occurs
- Sync will work but without timeout protection for very large datasets
