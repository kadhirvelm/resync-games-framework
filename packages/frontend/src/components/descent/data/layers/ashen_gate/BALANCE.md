# Ashen Gate economy balance

This pass targets army/building spam without slowing each gathering action.
Values are simulation time, not wall time at accelerated game speed.

## Budget and throughput

| Lever | Before | Now |
| --- | --- | --- |
| Warden cost | 30 Food / 15 Water | 60 Food / 30 Water |
| Villager cost | 10 Food / 8 Water | 20 Food / 16 Water |
| Soldier training | 10 seconds | 20 seconds |
| Villager training | 12 seconds | 24 seconds |
| Base population | 100 shared | 8 per allied player |
| Housing | 30 Wood / 20 Stone for +10 pop | 60 Wood / 40 Stone for +10 pop |
| Barracks | 40 Wood / 20 Stone | 60 Wood / 30 Stone |
| Well | 20 Wood / 10 Stone | 30 Wood / 15 Stone |
| Other functional buildings and tier upgrades | Original costs | Twice the original costs |

Combat recruitment costs double consistently in both the combat and economy
catalogs. HP, damage, gathering, deposits, renewable output, build times and
waves are unchanged. Placeholder Ward/Trap costs are unchanged. Starting Wood
increases from 60 to 80 to offset part of the Barracks increase.

### Opening

The starting 160 Food / 83 Water pays for a worker plus two Wardens, leaving
20 Food / 7 Water. Fielding all three recruits requires Housing because only
two base slots are free. Previously these supplies paid for a worker plus five Wardens. A Barracks
leaves 20 Wood / 20 Stone; the next Well needs another 10 Wood. One builder
finishes a Barracks in about 30 seconds; two Wardens then take 40 seconds,
leaving room before the scout wave at 120 seconds, excluding builder travel.

### Recruitment and income

One Barracks now delivers three soldiers/minute rather than six. The
165-second scout-to-swarm interval permits eight recruits rather than sixteen,
before resource, population and build-time limits. Continuous Warden production
still consumes 180 Food / 90 Water per minute: doubling price and duration
halves the army delivered, not the spending rate of an active queue.

One economy step is 0.5 seconds. A worker collects 10 Food/Water/Wood in
12 steps (6 seconds), a theoretical 100/minute before travel. With an illustrative
8-step walk each way, throughput is about 43/minute before task transitions.
Thus continuous Warden recruitment needs about 4.2 Food workers and 2.1 Water
workers at that distance. These are analytical estimates, not measured income.

The map contains 1,500 Food and 1,500 Water in finite deposits: enough for
25 Wardens rather than 50, before workers and other consumption. Starting
supplies increase that ceiling to 27. Renewable production, trading and rewards
are not included; this is a finite-budget comparison, not a hard army limit.

The Cultivator (1), starting Rider (2), and three villagers (3) use six of the
eight base population slots: two more villagers fit, then Housing is required. Each completed house
adds ten slots. Housing competes with infrastructure for construction materials.
Riders retain their two-pop class cost after spawning, plus higher-realm costs.
Co-op receives the base allowance per player; the allowance is saved, and
legacy saves recover it from the saved roster, falling back to distinct surviving
Hold owners when no roster exists.

### Construction trade-offs

Finite deposits plus starting supplies contain 1,100 Wood / 710 Stone. All three
Hold upgrades consume 280 Wood / 350 Stone. Barracks + Well + Farm + Storehouse
+ Housing consume another 250 Wood / 95 Stone. That leaves 570 Wood / 265 Stone
for defenses, cultivation or replacements: building every branch is deliberately
not free. This finite-map budget does not assume a renewable timber building. Two extra
nearby wood patches (180 Wood each) double the opening timber reserve from
360 to 720 Wood; every co-op Camp likewise gains two 180-Wood patches. These
are harvestable resource nodes, not decorative scenery. Food/Water reserves
and harvest rates remain unchanged, so extra timber does not fund unit spam.

## Validation and limits

`logic/economy/__tests__/balance.test.ts` guards the opening purchasing power,
training rates, finite resource budget, catalog parity, Housing, Rider population
and co-op allowance. The slice integration test exercises gathering, progression,
combat, save/reload and Cinderjaw victory with the revised costs.

This is a math-backed first pass, not a claim of playtest-proven difficulty.
Next playtest measurements: army size at each wave, time of first Housing and
Outpost, idle trainer time, worker losses, and unspent Wood/Stone at victory.
Existing saves keep their stockpiles, units and generated resource nodes; the
extra wood patches appear on new runs. The lower cap applies to future training
without deleting existing units, and new prices apply to future orders.
Already queued orders keep their serialized cost and duration. Very old orders
without a recorded cost refund historical prices rather than the new prices.
