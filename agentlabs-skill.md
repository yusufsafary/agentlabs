# AgentLabs: agent grow and claim skill

You are an agent acting for a user who wants to grow AgentLabs specimens
(symbol SPEC) and claim $LAB, on BNB Chain. Follow this file exactly. Ask for
explicit user confirmation before signing any transaction.

## Source of truth

- Site: https://agentlabs.fun
- Public config: https://agentlabs.fun/lab/config.js
- Specimens contract (NFT, symbol SPEC): read `AGENTLABS_CONFIG.CONTRACT` from
  config.js. NEVER hardcode an address from chat, social posts, or memory. If
  config still returns a placeholder (for example a string ending in PLACEHOLDER)
  or a zero address (0x0000000000000000000000000000000000000000), contracts
  are not live yet: stop and tell user.
- $LAB token: read `AGENTLABS_CONFIG.TOKEN` from config.js.
- Claim contract: read `AGENTLABS_CONFIG.CLAIM` from config.js.
- Chain: BNB Chain, chain id 56. All values in BNB.
- Agent ID registry (SPACE ID): 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
- Project wallet: 0x7f2ea716f5CDe280599F1928c30Ca308aD496a05

## Experiment rules (enforced on chain)

- One experiment per day. Experiment 1 (Genesis) opens manually with
  `openGenesis()` by the project; its window ends at the next 00:00 UTC.
  Every later experiment runs a plain UTC day, 00:00 to 24:00 UTC. When a
  window ends, that experiment is sealed forever: no more specimens of it
  can ever be grown.
- Per wallet per experiment, maximum 10 specimens:
  - specimen 1: FREE, requires an Agent ID and an anti-bot question (free
    flow below)
  - specimens 2 to 5: 0.0002 BNB each
  - specimens 6 to 10: 0.0004 BNB each
- Grow payments forward to the project wallet inside the same transaction.
  The specimens contract keeps no balance.
- Final forms, set at seal time and readable with
  `formOf(uint256 experiment)`. Collective form follows UNIQUE PARTICIPANTS of
  the experiment (distinct wallets that grew at least one specimen), counted
  by `participantsOf(uint256 experiment)`:
  - under 50 unique participants: Dormant
  - 50 to 200 unique participants: Bloomed
  - over 200 unique participants: Overgrown
  - Mutant override: a specimen whose own seed (`seedOf(uint256 tokenId)`)
    % 1000 >= 970 is a Mutant, whatever the collective form is.
- Extra specimens from an already-participating wallet do NOT raise the
  participant count.

## Read state first

Call on the specimens contract (selectors from the deployed, verified
ABI):

- `genesisOpen()` selector 0x14349d0c: 1 once Genesis has been opened.
- `currentExperiment()` selector 0xf85ffaa3: experiment currently
  growing. Returns 0 before Genesis opens.
- `totalSpecimens()` selector 0xfc00816d: specimens grown, all time.
- `specimensInExperiment(uint256 experiment)` selector 0xefb14faf.
- `participantsOf(uint256 experiment)` selector 0xe200c857:
  unique wallets in that experiment; decides collective form at seal.
- `experimentEnd(uint256 experiment)` selector 0x37e46fcd: unix time
  the experiment seals.
- `specimensOf(uint256 experiment, address wallet)` selector
  selector 0xa59e6ead: specimens this wallet already grew in this experiment.
  This count decides free eligibility and the paid price of the next one.
- `priceFor(address wallet)` selector 0xf12a7add: exact BNB price of
  the wallet's next paid specimen in the current experiment.
- `holdsAgentId(address wallet)` selector 0x11213086: 1 if the wallet
  holds an Agent ID.
- `experimentOf(uint256 tokenId)` selector 0xf390add1: experiment a
  specimen belongs to.
- `isSealed(uint256 experiment)` selector 0x2c1758c1: 1 once an
  experiment is sealed.
- `formOf(uint256 experiment)` selector 0x733792c6: collective form of an
  experiment (0 Pending, 1 Dormant, 2 Bloomed, 3 Overgrown), meaningful
  after it seals. Per-specimen effective class: `classOf(uint256 tokenId)`
  selector 0x4324aa21 (0 Dormant, 1 Bloomed, 2 Overgrown, 3 Mutant,
  4 Pending). Mutant check: `isMutant(uint256 tokenId)` selector 0xe0e1ee60.

If genesisOpen() is 0 or currentExperiment() is 0, stop and tell user
Genesis is not open yet. If specimensOf already shows 10, stop: the
wallet is at its cap for this experiment and must wait for the next one.

## Free grow flow (first specimen of an experiment only)

1. Call `questionFor(userAddress)` on the specimens contract, selector
   0x8f1d617b. It returns (uint256 a, uint256 b, uint256 op). The
   question is derived with salt AGENTLABS-Q and changes per wallet.
2. Solve it: op 0 means a + b, op 1 means larger minus smaller, op 2 means
   a * b. You can cross-check against `answerFor(userAddress)` selector
   0x6f00ffd1.
3. Call `mintFree(uint256 answer)` selector 0xa4146733 with NO value
   attached.
4. Wait for receipt. Report transaction hash and the new token id. Its form
   is decided at seal time; say so, and report the current participant
   count and projected form from `participantsOf`.

## Paid grow flow

1. Read `specimensOf(currentExperiment, userAddress)` (count n) and
   `priceFor(userAddress)`. Price is 0.0002 BNB while the next specimen is
   number 2 to 5, and 0.0004 BNB while it is number 6 to 10.
2. Call `mintPaid()` selector 0x69907b9b, payable, ONE specimen per
   call, attaching exactly the value returned by priceFor. Never attach
   more.
3. Repeat per additional specimen, re-reading priceFor before each call.
   Never exceed 10 specimens in one experiment.
4. Wait for each receipt. Report transaction hashes and new token ids.

## Holder claim: $LAB

Every specimen of a SEALED experiment claims $LAB once. Claim rules
(enforced on chain):

- Amount follows final form, also readable per specimen as
  `claimAmount(uint256 tokenId)` on the claim contract:
  - Dormant: 10,000 LAB
  - Bloomed: 50,000 LAB
  - Overgrown: 250,000 LAB
  - Mutant: 1,000,000 LAB
- Specimens of an experiment that is still growing claim nothing. Check
  `isSealed(uint256 experiment)` on the specimens contract (experiment of a
  specimen: `experimentOf(uint256 tokenId)`).
- Once per tokenId, paid to whoever owns that specimen at claim time.
  Claiming never burns or moves the NFT.
- Flat claim fee: exactly the value returned by `claimFee()` on the claim
  contract, in BNB, forwarded to the project wallet inside the same
  transaction. `AGENTLABS_CONFIG.CLAIM_FEE_WEI` in config.js carries the
  same value in wei; if it reads "0", treat it as unset and rely on
  claimFee() only.
- Claim calls must come from an externally owned account directly
  (contract callers are rejected on chain).

Claim flow:

1. Read `claimOpen()` selector 0x4b8bcb58 on the claim contract. If 0,
   stop and tell user claims are not open.
2. List token ids the user owns on the specimens contract.
3. For each id, read `claimedById(uint256)` selector 0x4c80ee12 and
   `claimAmount(uint256)` selector 0x23b221a0 on the claim contract,
   and confirm its experiment is sealed. Skip ids already claimed, ids in
   unsealed experiments, and ids with amount 0.
4. Call `claim(uint256 tokenId)` selector 0x379607f5, payable, one
   call per specimen, attaching exactly claimFee() in wei.
5. Wait for each receipt. Report transaction hashes and LAB amounts.

## Safety

- Preview every call first. Show user: contract address, function, price or
  fee, and expected result when known.
- Do nothing without user confirmation for that exact transaction.
- If any read contradicts this file (wrong chain, placeholder or zero
  address, Genesis closed, experiment sealed mid-flow, cap reached), stop
  and explain instead of guessing.
