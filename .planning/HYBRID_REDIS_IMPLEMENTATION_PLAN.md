# Hybrid + Redis Architecture Implementation Plan

## Overview
Implementing a robust real-time crash game architecture with:
- Redis for fast, durable current round state
- Periodic persistence to PostgreSQL for audit
- Improved crash handling with DB as source of truth
- Immutable audit log for regulatory compliance

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME FLOW                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Round starts → Redis (fast) + DB every 1s (audit)                       │
│  2. Multiplier updates every 100ms → Redis only (fast)                      │
│  3. Player cashes out → Read from Redis (current multiplier)                │
│  4. Round crashes → Reload from DB (all cashouts) → Mark crashed → Save     │
│  5. Audit log → Write immutable record for every action                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Fixes (Week 1, Days 1-2)
**Priority: CRITICAL**

#### 1.1 Add Periodic Persistence
- [ ] Implement `persistRoundState()` cron in `RoundLifecycleManager`
- [ ] Run every 1 second to persist current round to DB
- [ ] Handle OptimisticLockError with retry or skip

**File:** `services/games/src/infrastructure/scheduling/round-lifecycle-manager.ts`

```typescript
@Cron('*/1 * * * * *')
private async persistRoundState() {
  if (!this.currentRound) return;

  try {
    await this.roundRepository.upsertVersioned(this.currentRound);
  } catch (error) {
    // Log but don't throw - game continues
  }
}
```

#### 1.2 Fix Crash Handling (Use DB as Source)
- [ ] Reload Round from DB on crash
- [ ] Apply crash to DB version (has all cashouts)
- [ ] Publish events from DB version
- [ ] Clear from Redis after crash

**File:** `services/games/src/infrastructure/scheduling/round-lifecycle-manager.ts`

```typescript
private async handleRoundCrashed() {
  const latest = await this.roundRepository.findById(this.currentRound.id);
  latest.crash();
  await this.roundRepository.save(latest);
  // ... rest of flow
}
```

### Phase 2: Add Redis (Week 1, Days 3-4)
**Priority: HIGH**

#### 2.1 Install Dependencies
```bash
cd services/games
bun add @redis/client ioredis
bun add -D @types/ioredis
```

#### 2.2 Create Redis Service
- [ ] Create `RedisService` with connection management
- [ ] Implement `getCurrentRound(roundId)`
- [ ] Implement `setCurrentRound(roundId, round)`
- [ ] Add auto-reconnect and error handling

**New File:** `services/games/src/infrastructure/redis/redis.service.ts`

#### 2.3 Update RoundLifecycleManager
- [ ] Inject `RedisService`
- [ ] Persist to Redis on every multiplier update
- [ ] Load from Redis on startup (recovery)
- [ ] Clear from Redis on crash

**File:** `services/games/src/infrastructure/scheduling/round-lifecycle-manager.ts`

#### 2.4 Update Docker Compose
- [ ] Add Redis container to `docker-compose.yml`
- [ ] Configure persistence (AOF)
- [ ] Add healthcheck

**File:** `docker-compose.yml`

### Phase 3: Audit Log (Week 1, Day 5)
**Priority: MEDIUM**

#### 3.1 Create Audit Log Schema
- [ ] Add `AuditLog` Prisma model
- [ ] Run migration
- [ ] Add indexes for queries

**File:** `services/games/prisma/schema.prisma`

#### 3.2 Create Audit Service
- [ ] Create `AuditLogService`
- [ ] Implement `logPlayerAction()`
- [ ] Add cryptographic hash for verification

**New File:** `services/games/src/infrastructure/audit/audit-log.service.ts`

#### 3.3 Integrate Audit Logging
- [ ] Log all bets
- [ ] Log all cashouts
- [ ] Log round completions
- [ ] Add background job to cleanup old logs

### Phase 4: Hardening (Week 2)
**Priority: HIGH**

#### 4.1 Add Recovery Logic
- [ ] On startup: try Redis, fallback to DB
- [ ] Validate round state consistency
- [ ] Alert if state is corrupted

#### 4.2 Add Reconciliation Job
- [ ] Compare Redis vs DB state hourly
- [ ] Compare events vs audit log
- [ ] Alert on discrepancies

#### 4.3 Add Circuit Breakers
- [ ] Stop game if Redis is down
- [ ] Stop game if DB write fails repeatedly
- [ ] Alert operations team

#### 4.4 Load Testing
- [ ] Test with 1000 concurrent users
- [ ] Test 100 cashouts per second
- [ ] Measure latency p95, p99
- [ ] Test restart scenarios

### Phase 5: Production Readiness (Week 3)
**Priority: HIGH**

#### 5.1 Monitoring
- [ ] Add Prometheus metrics
- [ ] Add Grafana dashboards
- [ ] Add alerting rules

#### 5.2 Documentation
- [ ] Update API docs
- [ ] Add runbooks
- [ ] Add troubleshooting guide

#### 5.3 Deployment
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Gradual rollout to production

## Migration Path to Event Sourcing

Once this is stable, we can evolve to full Event Sourcing:
1. Events are already being emitted
2. Add event store database
3. Rebuild state from events instead of DB
4. Keep Redis as read model cache

## Success Criteria

- [ ] Cashouts use correct multiplier (no more 1x at 1.26x)
- [ ] Service restart doesn't lose current round
- [ ] Audit trail exists for all player actions
- [ ] Can handle 1000 concurrent players
- [ ] p99 latency < 100ms for cashout
