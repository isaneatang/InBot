# BOT Chain Network Configuration

Verified network values for the on-chain invoice factoring platform. All values below were
verified against official BOT Chain sources on 2026-08-27. This file documents where each
value came from so financial configuration can be traced and audited.

## Active network switch

The frontend selects its network through a single exported constant in
`frontend/src/config/network.ts`, named `ACTIVE_NETWORK_KEY`. Its default value is `"testnet"`.
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

Deployed to BOT Chain Testnet (chain id 968) on 2026-08-27.

- Contract address: 0x04c168f01e749ce16b274e9bea22c5ddc2c3e6a2
- Deployment transaction hash: 0x7fb2307a218cbd0cd72faca66de076b8d784bbde8035d7dba74068863eb4df1f
- Contract on testnet explorer: https://scan.bohr.life/address/0x04c168f01e749ce16b274e9bea22c5ddc2c3e6a2
- Verified on-chain reads: usdtToken() = 0x75edC9335175Fc0552D51D48439F229c10420fe3, platformFeeRecipient() = 0x22BD077f40C317F1adDd9871980d82007Fa75e7E, PLATFORM_FEE_BPS() = 50, nextInvoiceId() = 0.

The address is set in `frontend/src/config/network.js` as `INVOICE_FACTORY_ADDRESS`. This
contract is immutable and ownerless; it cannot be upgraded or repointed.

See `steps.txt` for the exact redeploy command and where the resulting address must be
updated in `frontend/src/config/network.ts`.

## Verification notes and caveats

- The testnet USDT contract at 0x75edC9335175Fc0552D51D48439F229c10420fe3 displays a token
  label of "Stub Token (goerli)" on the block explorer token page, but direct RPC calls to
  `name()`, `symbol()`, and `decimals()` return "Tether USD", "USDT", and 6 respectively.
  The bridge documentation lists this address as the USDT token contract on BOT Chain
  Testnet, so it was used. The explorer label appears to be a cosmetic mismatch in the
  blockscout instance and is flagged here as a minor unresolved discrepancy.
- Brand colors from the official brand kit could not be reliably parsed (the kit is
  distributed as a zip archive). The muted palette specified in the build prompt was used
  for the default theme.