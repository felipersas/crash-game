# Auto Cashout Frontend — Design Spec

## Summary

Add auto cashout configuration to the bet placement panel. Players set a target multiplier — the backend automatically cashes out when the multiplier hits that value during a round.

## Decisions

- **UI**: Toggle + inline input with quick preset buttons [1.5×] [2×] [5×] [10×]
- **Default state**: OFF every round, remembers last typed multiplier value in localStorage
- **Validation**: 1.01× to 1000×, two decimal places max

## User Flow

1. Player toggles auto cashout ON during betting phase
2. Multiplier input appears with last-used value (or empty if first time)
3. Player types a value or clicks a preset button
4. Player places bet — `autoCashOutAt` sent to `POST /games/bet`
5. During round, `BetStatusDisplay` shows "Auto @ X.XX×" indicator
6. Backend handles auto cashout via Redis/BullMQ — no client-side multiplier watching
7. Next round: toggle resets to OFF, input remembers last value

## Files to Modify

### 1. `frontend/src/schemas/bet-form.schema.ts`
- Add optional `targetMultiplier` field
- Zod validation: `z.number().min(1.01).max(1000).multipleOf(0.01).optional()`

### 2. `frontend/src/app/(games)/games/_components/bet-controls/BetControls.tsx`
- Add auto cashout toggle switch below bet amount
- When ON: show multiplier input + preset buttons [1.5×] [2×] [5×] [10×]
- Active preset gets highlighted border (lime)
- Container gets subtle green glow when enabled
- Disabled during non-betting phases (roundStatus !== 'BETTING')
- Persist last value to localStorage key `auto-cashout-last-multiplier`

### 3. `frontend/src/hooks/useGame.ts`
- Map schema `targetMultiplier` → API field `autoCashOutAt` in placeBet mutation payload when toggle is ON
- Omit field when toggle is OFF (backend treats undefined/null as no auto cashout)

### 4. `frontend/src/libs/games-api.ts`
- Add optional `autoCashOutAt` field to bet request body

### 5. `frontend/src/app/(games)/games/_components/bet-controls/BetStatusDisplay.tsx`
- When `myActiveBet.autoCashOutMultiplier` is set and bet is ACTIVE:
  - Show "AUTO @ X.XX×" indicator below the cashout button
  - Style: lime text, subtle glow

## Component State

```
BetControls internal state:
  autoCashOutEnabled: boolean     // toggle state, resets to false each round
  targetMultiplier: number | null // persisted to localStorage
```

No Zustand store changes needed — auto cashout is local to BetControls.

## Validation Rules

- Minimum: 1.01×
- Maximum: 1000×
- Step: 0.01 (two decimal places)
- Preset buttons bypass manual validation (predefined values)
- Manual input rounds to 2 decimal places on blur

## Edge Cases

- **Toggle OFF after typing**: value preserved in localStorage, not sent with bet
- **Manual cashout during round**: backend clears auto cashout target automatically
- **Round crashes before target**: bet settles as LOST, no special frontend handling
- **Preset click while typing**: overwrites input with preset value
- **Non-betting phase**: entire auto cashout section disabled/grayed

## Testing

- Unit: Zod schema validation (valid/invalid multipliers)
- Unit: preset button value selection
- Unit: localStorage persistence of last value
- E2E: place bet with auto cashout, verify API payload
- E2E: toggle persistence across rounds
