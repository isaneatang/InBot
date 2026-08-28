# BOT Chain Network Configuration

Verified network values for the on-chain invoice factoring platform. All values below were
verified against official BOT Chain sources on 2026-08-27. This file documents where each
value came from so financial configuration can be traced and audited.

## Active network switch

The frontend selects its network through a single exported constant in
`frontend/src/config/network.js`, named `ACTIVE_NETWORK_KEY`. Its default value is `"testnet"`.
Change it to `"mainnet"` to point the entire application (chain id, RPC, USDT address, and
block explorer) at BOT Chain Mainnet with no other code changes. The contract is immutable
once deployed, so a mainnet switch requires redeploying the contract with the mainnet USDT
address.

## Tooling choice

Foundry was chosen for contract compilation, testing, and deployment scripting because it is
fast, has a robust built-in test runner with fuzzing and cheatcodes, and needs no separate
Node process for the contract layer. Hardhat would be an equally valid choice; Foundry was
picked for build speed and test ergonomics.

## Verified network values

### BOT Chain Testnet (default)

| Item | Value | Source |
| --- | --- | --- |
| Chain ID | 968 | dev-docs.botchain.ai/docs/Developers/quick-guide |
| RPC URL | https://rpc.bohr.life | dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint |
| Block explorer | https://scan.bohr.life | dev-docs.botchain.ai/docs/Developers/quick-guide |
| Native currency | BOT | dev-docs.botchain.ai/docs/Developers/quick-guide |
| USDT contract | 0x75edC9335175Fc0552D51D48439F229c10420fe3 | dev-docs.botchain.ai/docs/Bridge/contract-addresses |
| USDT decimals | 6 | on-chain eth_call to decimals() via rpc.bohr.life |
| USDT symbol | USDT (name "Tether USD") | on-chain eth_call to symbol()/name() via rpc.bohr.life |

### BOT Chain Mainnet

| Item | Value | Source |
| --- | --- | --- |
| Chain ID | 677 | dev-docs.botchain.ai/docs/Developers/quick-guide |
| RPC URL | https://rpc.botchain.ai | dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint |
| Block explorer | https://scan.botchain.ai | dev-docs.botchain.ai/docs/Developers/quick-guide |
| Native currency | BOT | dev-docs.botchain.ai/docs/Developers/quick-guide |
| USDT (bridged) | 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C | dev-docs.botchain.ai/docs/Bridge/contract-addresses |
| USDT decimals | 6 | on-chain eth_call to decimals() via rpc.botchain.ai |
| USDT symbol | USDT | on-chain eth_call to symbol() via rpc.botchain.ai |

## Deployed contract

Redeployed to BOT Chain Testnet (chain id 968) on 2026-08-28 to ship three contract fixes that
could not be applied to an immutable deployment. See feedback.txt section 8 for what changed
and why.

### Current deployment (use this one)

- Contract address: 0x1e6c1FD4a91Eefd68b22d70574d263FBe617a7be
- Deployment transaction hash: 0x282d03c139e2fe4fe443640c10271151ee61c4ff711e1f21274ffc0f5264cb7f
- Contract on testnet explorer: https://scan.bohr.life/address/0x1e6c1FD4a91Eefd68b22d70574d263FBe617a7be
- Verified on-chain reads immediately after deployment: usdtToken() =
  0x75edC9335175Fc0552D51D48439F229c10420fe3, platformFeeRecipient() =
  0x22BD077f40C317F1adDd9871980d82007Fa75e7E, PLATFORM_FEE_BPS() = 50, nextInvoiceId() = 0.

### Superseded deployment (do not use)

- Contract address: 0x04c168f01e749ce16b274e9bea22c5ddc2c3e6a2
- Deployment transaction hash: 0x7fb2307a218cbd0cd72faca66de076b8d784bbde8035d7dba74068863eb4df1f
- Superseded on 2026-08-28. Its invoice history is orphaned and the frontend no longer reads
  it. It remains on chain because nothing can remove it.

The active address is set in `frontend/src/config/network.js` as `INVOICE_FACTORY_ADDRESS`.
This contract is immutable and ownerless; it cannot be upgraded or repointed. Any future fix
requires another redeployment and another address change.

### Live scenario verification

Both end to end scenarios were traced against the live testnet contract on 2026-08-28, not
only in the local test suite.

Invoice 0, direct payment: created at 100.000000 USDT, confirmed by the buyer with a due date
15 minutes out, paid in full. Fee recipient received 0.500000 USDT, the seller claimed exactly
99.500000 USDT, onTimePayments(buyer) became 1, and sweepableDust returned 0.

Invoice 1, partially sold and defaulted with a stake: created at 100.000000 USDT, tokenized at
8000 bps with a 20.000000 USDT stake. Investor A bought 3000 bps for 24.000000 USDT and
investor B bought 1000 bps for 8.000000 USDT, so totalSoldPercentageBps reached 4000. After
the due date passed, markDefault was called by an investor rather than a privileged party. The
contract recorded stakeConsumed = true, repaidAmount = 20.000000 USDT and
distributionBasisBps = 4000. Investor A claimed 15.000000 USDT and investor B claimed
5.000000 USDT, so the whole 20.000000 USDT stake reached investors, sweepableDust returned 0,
claimableSellerShare returned 0, and defaultCount(buyer) became 1.

## Verification notes and caveats
## Verification notes and caveats

- The testnet USDT contract at 0x75edC9335175Fc0552D51D48439F229c10420fe3 displays a token
  label of "Stub Token (goerli)" on the block explorer token page, but direct RPC calls to
  `name()`, `symbol()`, and `decimals()` return "Tether USD", "USDT", and 6 respectively.
  The bridge documentation lists this address as the USDT token contract on BOT Chain
  Testnet, so it was used. The explorer label appears to be a cosmetic mismatch in the
  blockscout instance and is flagged here as a minor unresolved discrepancy.
- Brand colors from the official brand kit could not be reliably parsed (the kit is
  distributed as a zip archive). The muted palette specified in the build prompt was used
  for the default theme, adjusted only in lightness for contrast. The hue structure and the
  deliberate restraint of the specified palette were kept.
- The active contract is source verified on scan.bohr.life. Confirmed by reading it back from
  the explorer API: ContractName InvoiceFactory, compiler v0.8.28+commit.7893614a, optimization
  enabled, full source and ABI published. Blockscout accepted the submission without an API
  key. The superseded deployment is not verified.
  Command used, from the `contracts` directory:

      forge verify-contract 0x1e6c1FD4a91Eefd68b22d70574d263FBe617a7be \
        src/InvoiceFactory.sol:InvoiceFactory --chain-id 968 \
        --verifier blockscout --verifier-url https://scan.bohr.life/api/ \
        --constructor-args "$(cast abi-encode 'constructor(address,address)' \
          0x75edC9335175Fc0552D51D48439F229c10420fe3 \
          0x22BD077f40C317F1adDd9871980d82007Fa75e7E)" --watch