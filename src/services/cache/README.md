# src/services/cache/ - Caching Layer

Caching services to avoid repeated API calls.

## Files

- **environmentCache.ts** - Singleton cache for runtime environments. Loads and caches available environments for Datalayer runtime creation to avoid repeated API calls. Supports force-refresh to bypass cache.
