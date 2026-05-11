# Algoritmo Provably Fair - Crash Point

## Visão Geral

O sistema usa um esquema de **hash chain** (commitment scheme) para garantir que o crash point de cada round é predeterminado **antes** do round começar e não pode ser manipulado. Após o crash, o jogador pode verificar matematicamente que o resultado era justo.

---

## Conceito Fundamental

```
Antes do round:  Servidor publica seedHash = H(seed)     → comprometimento
Durante o round: Multiplicador sobe até crashPoint
Após o crash:    Servidor revela seed                     → prova
Jogador verifica: H(seed_revelado) === seedHash_publicado → justiça
```

O jogador não pode saber o crash point antes (porque não tem o seed), mas pode verificar depois que o servidor não mudou o resultado.

---

## Hash Chain (SeedChain)

### O que é uma Hash Chain?

Uma sequência de seeds onde cada seed é o hash do próximo:

```
seed[999] = aleatório (32 bytes criptograficamente seguro)
seed[998] = SHA-256(seed[999])
seed[997] = SHA-256(seed[998])
...
seed[1]   = SHA-256(seed[2])
seed[0]   = SHA-256(seed[1])
commitment = SHA-256(seed[0])
```

### Propriedade de Verificação

Para qualquer seed na posição N:
- **Claim**: "O seed da posição N é X"
- **Prova**: `SHA-256(X)` deve igual `seed[N-1]`
- Cada seed compromete com o próximo; revelar um prova que era pré-determinado

### Visualização da Chain

```
commitment = H(seed[0])  ← publicado no startup do serviço
    │
seed[0] = H(seed[1])     ← usado no round 1
seed[1] = H(seed[2])     ← usado no round 2
seed[2] = H(seed[3])     ← usado no round 3
...
seed[999]                ← seed original aleatório
```

---

## Implementação

### Geração da Chain

**Arquivo**: `domain/value-objects/seed-chain.value-object.ts`

```typescript
static async generate(size: number = 1000): Promise<SeedChain> {
  const seeds: string[] = [];

  // 1. Gera último seed aleatoriamente (32 bytes = 64 hex chars)
  const lastSeed = await SeedChain.generateRandomSeed();
  seeds.push(lastSeed);

  // 2. Constrói chain de trás pra frente
  let currentSeed = lastSeed;
  for (let i = 1; i < size; i++) {
    currentSeed = await SeedChain.hashSeed(currentSeed);  // SHA-256
    seeds.unshift(currentSeed);  // adiciona no início
  }

  // 3. Commitment = hash do primeiro seed
  const commitment = await SeedChain.hashSeed(seeds[0]);

  return new SeedChain({ seeds, current: 0, commitment });
}
```

**Por que de trás pra frente?** Porque `seed[0] = H(seed[1]) = H(H(seed[2])) = ...`. O seed mais antigo (último) é gerado aleatoriamente, e cada seed anterior é o hash do próximo. Isso garante que conhecendo seed[N], você pode verificar mas não pode calcular seed[N+1].

### Geração de Seed Aleatório

```typescript
private static async generateRandomSeed(): Promise<string> {
  const seedBytes = new Uint8Array(32);     // 256 bits
  crypto.getRandomValues(seedBytes);         // CSPRNG do sistema operacional
  return SeedChain.bytesToHex(seedBytes);    // 64 caracteres hex
}
```

### Hash SHA-256

```typescript
private static async hashSeed(seed: string): Promise<string> {
  const seedBytes = SeedChain.hexToBytes(seed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', seedBytes);
  return SeedChain.bytesToHex(new Uint8Array(hashBuffer));
}
```

---

## Cálculo do Crash Point

**Arquivo**: `domain/value-objects/crash-point.value-object.ts`

### Fórmula

```
crashPoint = max(1.00, (1 - 0.04) / (first52Bits / 2^52))
```

### Passo a Passo

```typescript
static async fromSeed(seed: string): Promise<CrashPoint> {
  // 1. Converte seed hex para bytes
  const seedBytes = CrashPoint.hexToBytes(seed);

  // 2. Hash SHA-256 do seed → 256 bits
  const hashBuffer = await crypto.subtle.digest('SHA-256', seedBytes);
  const hashArray = new Uint8Array(hashBuffer);

  // 3. Extrai primeiros 52 bits do hash (usando BigInt para precisão)
  const first52Bits = this.extractBits(hashArray, 52);

  // 4. Normaliza para [0, 1)
  const max52Bit = 2^52 = 4503599627370496;
  const result = first52Bits / max52Bit;  // valor entre 0 e 1

  // 5. Aplica house edge de 4% e garante mínimo de 1.00x
  const crashPoint = Math.max(1.00, 0.96 / result);

  return new CrashPoint(crashPoint);
}
```

### Constantes

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `SEED_PRECISION` | 52 bits | Precisão da extração do hash |
| `HOUSE_EDGE` | 0.04 (4%) | Margem da casa |
| `MIN_CRASH` | 1.00x | Crash point mínimo (todos perdem) |

### Por que 52 bits?

52 bits = precisão de um `double` IEEE 754 (mantissa). Isso garante que a distribuição é uniforme sem perda de precisão por floating point.

### Extração de Bits (BigInt)

```typescript
private static extractBits(bytes: Uint8Array, bitCount: number): number {
  let result = 0n;
  let bitsCollected = 0;

  for (const byte of bytes) {
    if (bitsCollected + 8 >= bitCount) {
      const bitsNeeded = bitCount - bitsCollected;
      const mask = (1n << BigInt(bitsNeeded)) - 1n;
      result = (result << BigInt(bitsNeeded))
        | (BigInt(byte) >> BigInt(8 - bitsNeeded)) & mask;
      break;
    }
    result = (result << 8n) | BigInt(byte);
    bitsCollected += 8;
  }

  return Number(result);
}
```

Usa BigInt intermediário para não perder precisão na manipulação de bits, converte para Number no final.

### Detecção de Crash

```typescript
shouldCrashAt(multiplier: number): boolean {
  return multiplier >= this.value;
}
```

O `RoundLifecycleManager` chama isso a cada 100ms durante a fase ACTIVE. Quando retorna `true`, o round crasha.

---

## Fluxo Completo na Aplicação

### Diagrama de Sequência

```
Servidor Start
    │
    ├── SeedChain.generate(1000)           [1000 seeds + commitment]
    ├── Salva seed-chain.json              [persistência em arquivo]
    │
    ├── Round 1: createNewRound()
    │       │
    │       ├── seed = chain.seeds[0]
    │       ├── seedHash = H(seeds[0]) = commitment
    │       ├── Salva round no PostgreSQL (com seedHash)
    │       ├── chain.advance() → position = 1
    │       ├── Salva seed-chain.json (position atualizada)
    │       │
    │       ├── WebSocket: roundStarted { seedHash }     ← publicado ANTES
    │       │
    │       ├── [10s betting phase...]
    │       │
    │       ├── startRound()
    │       │       └── crashPoint = CrashPoint.fromSeed(seeds[0])
    │       │           → crashPoint calculado mas NÃO revelado
    │       │
    │       ├── [fase ACTIVE - multiplicador sobe a cada 100ms]
    │       │
    │       ├── CRASH! (multiplier >= crashPoint)
    │       │
    │       ├── WebSocket: crash { crashPoint, seed }    ← seed REVELADO
    │       └── Salva round no PostgreSQL (com crashPoint + seed)
    │
    ├── Round 2: createNewRound()
    │       ├── seed = chain.seeds[1]
    │       ├── seedHash = seeds[0] (já conhecido!)
    │       └── ... mesmo fluxo ...
    │
    └── ... continua até seed[999] → regenera chain
```

---

## Persistência da Seed Chain (JSON)

### Arquivo: `infrastructure/persistence/file/seed-chain.repository.impl.ts`

### Por que JSON e não PostgreSQL?

A seed chain é separada do banco de dados por **segurança**:
1. **Isolamento**: Seeds não ficam acessíveis via SQL. Se o DB for comprometido, os seeds futuros não são expostos.
2. **Criptografia at-rest**: O arquivo é criptografado com AES-256-GCM (Web Crypto API). Key via env var `SEED_CHAIN_ENCRYPTION_KEY`.
3. **Performance**: Read/write direto no filesystem é mais rápido que round-trip ao DB para algo que muda a cada round.
4. **Atomicidade**: Usa temp file + rename (operação atômica no filesystem POSIX).

### Caminho do Arquivo

```
services/games/data/seed-chain.json
```

### Estrutura do JSON

```json
{
  "seeds": [
    "a1b2c3d4e5f6...",   // seed[0] - usado no primeiro round
    "f7e8d9c0b1a2...",   // seed[1] - usado no segundo round
    ...                  // 998 seeds omitidos
    "9z8y7x6w5v4u..."    // seed[999] - seed original aleatório
  ],
  "current": 42,           // índice do próximo seed a usar
  "commitment": "d4e5f6a7b8c9..."  // H(seeds[0]) - publicado no startup
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `seeds` | `string[]` | Array de 1000 seeds hex (64 chars cada) |
| `current` | `number` | Posição atual na chain (incrementa a cada round) |
| `commitment` | `string` | Hash do primeiro seed (published commitment) |

### Operação de Save (Atomic Write)

```typescript
async save(chain: SeedChain): Promise<void> {
  const data = JSON.stringify(chain.toPersistence(), null, 2);

  // Escreve em arquivo temporário primeiro
  const tempPath = `${this.filePath}.tmp`;
  await fs.writeFile(tempPath, data, 'utf-8');

  // Renomeia (atômico em POSIX) - evita corrupção se crashar no meio
  await fs.rename(tempPath, this.filePath);
}
```

### Ciclo de Vida do Arquivo

```
Startup:
  ├── Arquivo existe? → load() → SeedChain.fromPersistence(data)
  └── Não existe? → generate(1000) → save()

A cada round:
  ├── advance() → current++
  └── save() → atualiza JSON

Regeneração (quando < 10% restante):
  ├── generate(1000) → nova chain
  └── save() → sobrescreve JSON
```

---

## Verificação pelo Jogador

### Endpoint de Verificação

```
GET /games/rounds/:roundId/verify
```

### Use Case: `VerifyRoundUseCase`

```typescript
async execute(input: { roundId: string }) {
  const round = await this.roundRepository.findById(input.roundId);

  // Dados do round salvo no PostgreSQL:
  const seed = round.getSeed();           // seed revelado após crash
  const seedHash = round.getSeedHash();   // commitment publicado antes do round
  const crashPointValue = round.getCrashPoint();

  // Verificação 1: seed bate com o hash publicado?
  const hashMatches = await SeedChain.verifySeed(seed, seedHash);
  //   → SHA-256(seed) === seedHash ?

  // Verificação 2: crash point bate com o seed?
  const calculated = await CrashPoint.fromSeed(seed);
  const crashPointMatches = Math.abs(
    calculated.getValue() - crashPointValue
  ) < 0.01;

  return {
    roundId,
    seed,                  // Para o jogador verificar
    seedHash,              // O que foi publicado antes
    verified: hashMatches && crashPointMatches,
    verificationFormula: 'SHA-256(seed) → extract 52 bits → max(1.00, 0.96 / (bits / 2^52))'
  };
}
```

### Como o Jogador Verifica Manualmente

```bash
# 1. Pegar seed e seedHash do endpoint /verify
SEED="a1b2c3d4..."
SEED_HASH="e5f6a7b8..."

# 2. Verificar que SHA-256(seed) = seedHash
echo -n "${SEED}" | xxd -r -p | sha256sum
# Deve retornar seedHash

# 3. Recalcular crash point (em qualquer linguagem)
# hash = SHA-256(seed_bytes)
# first52 = extract_first_52_bits(hash)
# result = first52 / 2^52
# crashPoint = max(1.00, 0.96 / result)
```

---

## Modo Determinístico (Testes)

### Env Var: `DETERMINISTIC_SEED`

```typescript
static async generate(size: number = 1000): Promise<SeedChain> {
  if (process.env.DETERMINISTIC_SEED) {
    return SeedChain.generateDeterministic(
      process.env.DETERMINISTIC_SEED,
      size
    );
  }
  // ... geração normal
}
```

### Geração Determinística

```typescript
static async generateDeterministic(seedString: string, size: number = 1000) {
  // Deriva seed de 32 bytes da string via SHA-256
  const stringBytes = new TextEncoder().encode(seedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', stringBytes);
  const lastSeed = SeedChain.bytesToHex(new Uint8Array(hashBuffer));

  // Constrói chain normalmente a partir desse seed
  // ...
}
```

### Seeds de Teste Conhecidos

| Seed String | Crash Point (aprox.) |
|-------------|---------------------|
| `test-crash-1.5-6` | 1.47x |
| `test-crash-2-94` | 1.98x |
| `test-crash-3-20` | 3.02x |
| `test-crash-5-179` | 5.10x |
| `test-crash-10-31` | 9.64x |

**Importante**: Chain size deve ser 1000 para bater com produção. O `RoundLifecycleManager` sempre usa `SeedChain.generate(1000)`.

---

## Regeneração da Chain

### Quando Regenerar?

```typescript
needsRegeneration(): boolean {
  const threshold = Math.floor(this.seeds.length * 0.1);  // 10%
  return this.current >= (this.seeds.length - threshold);
}
```

Quando restam menos de 100 seeds (10% de 1000), uma nova chain é gerada automaticamente no próximo `createNewRound()`.

### Impacto da Regeneração

- Novo commitment é publicado
- Seeds anteriores continuam verificáveis (estão no PostgreSQL)
- Jogadores precisam confiar no novo commitment a partir dali

---

## Distribuição de Probabilidade

Com a fórmula `crashPoint = max(1.00, 0.96 / result)` onde `result ~ Uniform(0, 1)`:

- **P(crash = 1.00x)** = ~4% (house edge)
- **P(crash >= 2.00x)** ≈ 48%
- **P(crash >= 5.00x)** ≈ 19.2%
- **P(crash >= 10.00x)** ≈ 9.6%
- **P(crash >= 100.00x)** ≈ 0.96%

---

## Arquivos Envolvidos

| Arquivo | Camada | Função |
|---------|--------|--------|
| `seed-chain.value-object.ts` | Domain | Hash chain, geração de seeds, verificação |
| `crash-point.value-object.ts` | Domain | Cálculo do crash point a partir do seed |
| `multiplier.value-object.ts` | Domain | Fórmula do multiplicador `e^(k×t)` |
| `round.entity.ts` | Domain | Usa CrashPoint + SeedChain |
| `round.events.ts` | Domain | Eventos com seed/seedHash |
| `seed-chain.repository.impl.ts` | Infrastructure | Persistência em JSON |
| `round-lifecycle-manager.ts` | Infrastructure | Orquestra seed chain + rounds |
| `verify-round.use-case.ts` | Application | Verificação pelo jogador |
| `games.controller.ts` | Presentation | Endpoint `/rounds/:id/verify` |

---

## Diagrama Completo

```
┌──────────────────────────────────────────────────────────┐
│                    STARTUP DO SERVIÇO                     │
│                                                          │
│  1. seed-chain.json existe?                              │
│     ├── SIM → load() → SeedChain com 1000 seeds          │
│     └── NÃO → SeedChain.generate(1000) → save()          │
│                                                          │
│  2. Publica commitment = H(seeds[0])                     │
│                                                          │
│  3. Cria primeiro round                                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    CADA ROUND                             │
│                                                          │
│  BETTING (10s)                                           │
│    ├── seed = seeds[current]                              │
│    ├── seedHash = H(seed) → publicado via WS              │
│    └── Jogadores apostam                                  │
│                                                          │
│  ACTIVE                                                  │
│    ├── crashPoint = CrashPoint.fromSeed(seed)             │
│    │     → SHA-256(seed) → 52 bits → max(1.00, 0.96/r)  │
│    ├── Multiplicador sobe: M(t) = e^(0.06t)              │
│    └── Se M(t) >= crashPoint → CRASH                     │
│                                                          │
│  CRASHED                                                 │
│    ├── Revela seed via WebSocket                          │
│    ├── Salva round no PostgreSQL                          │
│    ├── current++ → save seed-chain.json                   │
│    └── 5s → novo round                                   │
│                                                          │
│  VERIFICAÇÃO                                             │
│    ├── GET /rounds/:id/verify                             │
│    ├── Jogador calcula: SHA-256(seed) === seedHash?       │
│    └── Jogador recalcula: CrashPoint.fromSeed(seed) ===?  │
└──────────────────────────────────────────────────────────┘
```
