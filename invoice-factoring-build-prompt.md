# BUILD PROMPT: On-Chain Invoice Factoring Platform on BOT Chain

## HOW TO USE THIS DOCUMENT

You are building a complete, production-quality Web3 application from scratch. This document is your full specification. Read this entire document before writing a single line of code. Do not skip sections. Do not simplify or omit features described here without explicitly flagging the omission in the feedback file described at the end of this document.

If you encounter a technical detail you are not certain about (an exact RPC URL, a contract address, a library version, a BOT Chain-specific value), search the internet to verify it rather than guessing or inventing a plausible-looking value. Financial and network configuration values must be correct, not approximate.

Do not use em dashes anywhere in code comments, UI copy, documentation, or any generated text. Do not use other typical AI-generated writing patterns such as excessive rhetorical questions, "in today's fast-paced world" style filler, or overly enthusiastic marketing language. Write plainly, precisely, and professionally throughout, as a experienced engineer and technical writer would.

Work in clearly defined stages, in the order given below. Do not jump ahead to frontend polish before the contract and its tests are complete and correct. At the end of the build, perform the verification pass described in Stage 9 before considering the work done.

---

## PROJECT OVERVIEW

Build a decentralized invoice factoring platform on BOT Chain. The platform allows a seller to issue an on-chain invoice to a buyer. The buyer reviews and confirms the invoice, setting their own repayment due date at that time. The buyer can pay the invoice directly, or the seller can tokenize the unpaid invoice, selling fractional shares of it to investors at a discount before the due date. When the buyer eventually repays, funds are automatically distributed proportionally to investors and the seller. The platform tracks buyer repayment history permanently on-chain, and automatically grants an on-chain "Trusted" badge to addresses with a strong repayment record. The system is honest about the fact that it cannot force payment: if a buyer defaults, this is recorded permanently and visibly, but there is no on-chain recovery mechanism.

This is being built as a testnet proof-of-concept for a hackathon (BOT Chain Builder Challenge), with the intention of later applying for a grant. Frame all user-facing risk disclosures honestly: this is experimental software, defaults are possible, there is no regulatory protection, and no legal recourse is provided by the contract itself.

The project uses USDT as the primary payment and investment token on BOT Chain Testnet, with a configuration switch to move to BOT Chain Mainnet later without rewriting code.

---

## STAGE 1: RESEARCH AND VERIFY NETWORK DETAILS BEFORE WRITING ANY CODE

Before writing any contract or configuration code, search the internet and confirm the following. Do not proceed with placeholder or assumed values for any of these:

1. BOT Chain Testnet chain ID, RPC URL, block explorer URL, and native currency details.
2. BOT Chain Mainnet chain ID, RPC URL, and block explorer URL.
3. The exact contract address of the USDT token deployed on BOT Chain Testnet. This is likely obtainable from the official BOT Chain testnet faucet page or a recent transaction visible on the testnet block explorer. Do not assume it is the same address as any mainnet USDT contract on BOT Chain or any other chain.
4. The exact contract address of the official bridged USDT token on BOT Chain Mainnet. Verify this directly against the block explorer's verified contracts list, not from a third-party listing, since using the wrong token address in a financial contract is a serious error.
5. Confirm USDT's decimals on BOT Chain (standard USDT typically uses 6 decimals, but verify this against the actual deployed contract on BOT Chain specifically, since bridged tokens can sometimes differ).
6. BOT Chain's official brand color palette, from the official brand kit or brand guideline document linked from botchain.ai, if accessible. If the brand kit cannot be retrieved or parsed, fall back to the muted palette specified in the UI section of this document and note in the feedback file that brand colors could not be verified.

Record all confirmed values in the project's environment configuration and in a short `NETWORK_CONFIG.md` file at the project root documenting where each value was sourced from (URL of the source).

---

## STAGE 2: TECH STACK (fixed, do not substitute without strong reason)

- React with Vite as the build tool
- viem for all blockchain reads, writes, and event watching
- Reown AppKit as a wallet connection fallback and secondary option (see Wallet Connection section below for the primary/fallback structure required)
- Tailwind CSS for styling, configured with the custom design token palette specified later in this document
- Framer Motion for all animation and transition work
- No traditional backend server and no database. The only server-side component permitted is a small stateless serverless function (Vercel Edge Function or Cloudflare Worker) if and only if it becomes necessary for the on-chain "Trusted" badge logic described later, and this function must not hold any custodial funds or private keys beyond what is strictly required for its narrow purpose.
- Solidity ^0.8.24, using OpenZeppelin contracts for standard patterns (SafeERC20, ReentrancyGuard) where specified.
- Hardhat or Foundry for contract compilation, testing, and deployment scripting. Choose whichever you can implement most reliably; document the choice and reasoning in `NETWORK_CONFIG.md`.

---

## STAGE 3: SMART CONTRACT SPECIFICATION

Build a single core contract named `InvoiceFactory.sol`. Do not deploy a separate contract per invoice. All invoices are internal records within this one contract, keyed by a `uint256 invoiceId`. This contract has one fixed, deployed address that will be used for all interactions and will be the address submitted for any hackathon or grant review.

This is the most important part of this specification. The core contract is immutable once deployed. Every field, mapping, and event parameter listed below must be included exactly as specified, even where the current frontend does not yet have a UI for that field, because these cannot be added after deployment without a full contract migration. Do not simplify or omit any field below for the sake of a smaller MVP. Do not add features not listed below without flagging the addition clearly in the feedback file.

### 3.1 Data structures

```solidity
enum InvoiceStatus { Created, Confirmed, Tokenized, Repaid, Defaulted }

struct Invoice {
    address seller;
    address buyer;
    uint256 faceValue;          // in USDT smallest unit (respect actual token decimals)
    string description;
    uint256 dueDate;            // unix timestamp, set by buyer at confirmation
    InvoiceStatus status;
    uint256 createdAt;
    uint256 confirmedAt;
    uint256 totalSoldPercentageBps; // basis points, 0 to 10000, percentage of invoice sold to investors
    uint256 discountBps;        // basis points, discount rate at tokenization, e.g. 8500 = 85%
    uint256 stakedAmount;       // seller's first-loss buffer, in USDT smallest unit, 0 if none
    bool stakeConsumed;         // true if stake was used to cover a shortfall
    uint256 repaidAmount;       // actual amount repaid by buyer, 0 until repayment
}
```

### 3.2 State variables

```solidity
address public immutable usdtToken;
address public immutable platformFeeRecipient;
uint16 public constant PLATFORM_FEE_BPS = 50; // 0.5%, immutable, no setter, ever

uint256 public nextInvoiceId;
mapping(uint256 => Invoice) public invoices;
mapping(uint256 => mapping(address => uint256)) public investorContribution; // invoiceId => investor => amount contributed (in USDT, at discounted rate)
mapping(uint256 => address[]) public invoiceInvestors; // for iteration during distribution

mapping(address => string) public addressToUsername;
mapping(string => address) public usernameToAddress;

mapping(address => uint256) public onTimePayments;
mapping(address => uint256) public latePayments; // reserved for future grace period logic, track but do not enforce differently than default in MVP
mapping(address => uint256) public defaultCount;

uint256 public constant TRUSTED_MIN_REPAID = 5;
uint256 public constant TRUSTED_MAX_DEFAULTS = 0;
```

Add clear NatSpec comments on every state variable explaining its purpose, matching the level of detail used in the AxisPass and prior contracts referenced implicitly by this project's design lineage (write from scratch, do not copy any external codebase).

### 3.3 Events

Define these exactly. Every field must be included even if unused in the initial frontend build.

```solidity
event InvoiceCreated(uint256 indexed invoiceId, address indexed seller, address indexed buyer, uint256 faceValue, string description, uint256 timestamp);
event InvoiceConfirmed(uint256 indexed invoiceId, address indexed buyer, uint256 dueDate, uint256 timestamp);
event InvoicePaidDirect(uint256 indexed invoiceId, address indexed buyer, uint256 amount, uint256 fee, uint256 timestamp);
event InvoiceTokenized(uint256 indexed invoiceId, address indexed seller, uint256 discountBps, uint256 stakedAmount, uint256 timestamp);
event InvestmentMade(uint256 indexed invoiceId, address indexed investor, uint256 amountContributed, uint256 percentageBps, uint256 timestamp);
event InvoiceRepaid(uint256 indexed invoiceId, address indexed buyer, uint256 amount, uint256 fee, uint256 timestamp);
event InvestorClaimed(uint256 indexed invoiceId, address indexed investor, uint256 amount, uint256 timestamp);
event SellerClaimed(uint256 indexed invoiceId, address indexed seller, uint256 amount, uint256 timestamp);
event StakeReturned(uint256 indexed invoiceId, address indexed seller, uint256 amount, uint256 timestamp);
event InvoiceDefaulted(uint256 indexed invoiceId, address indexed buyer, uint256 timestamp);
event UsernameClaimed(address indexed user, string username, uint256 timestamp);
event TrustedStatusGranted(address indexed user, uint256 timestamp);
```

### 3.4 Core functions and required logic

Implement all of the following. For each, apply Checks-Effects-Interactions ordering strictly: update all internal state before making any external call (token transfer). Apply `ReentrancyGuard` from OpenZeppelin to every function that makes an external token transfer.

**createInvoice(address buyer, uint256 faceValue, string calldata description) external returns (uint256)**
Seller calls this. Validates buyer is not the zero address and not the seller themselves. Validates faceValue is greater than zero. Creates the invoice in `Created` status. Emits `InvoiceCreated`.

**confirmInvoice(uint256 invoiceId, uint256 dueDate) external**
Only callable by the invoice's designated buyer. Validates the invoice is in `Created` status. Validates `dueDate` is strictly in the future. Sets status to `Confirmed`. Emits `InvoiceConfirmed`. An invoice is not binding and cannot be paid or tokenized until this step happens.

**payDirect(uint256 invoiceId) external**
Only callable by the invoice's buyer. Validates status is `Confirmed` (not yet tokenized). Validates `block.timestamp <= dueDate`, reverting with a clear error if the deadline has passed. Pulls `faceValue` in USDT from the buyer via `safeTransferFrom`. Deducts the platform fee (0.5% of faceValue) and sends it to `platformFeeRecipient`. Sets status to `Repaid`. Increments `onTimePayments[buyer]`. Checks and grants Trusted status if thresholds are met. Emits `InvoicePaidDirect`.

**tokenizeInvoice(uint256 invoiceId, uint256 discountBps, uint256 stakeAmount) external**
Only callable by the invoice's seller. Validates status is `Confirmed`. Validates `block.timestamp < dueDate` (cannot tokenize an already-due or past-due invoice). Validates `discountBps` is between a sane minimum and 10000 (do not allow a discount of 0 or negative economics; document the exact minimum you choose, e.g. 5000, in code comments and in the feedback file). If `stakeAmount > 0`, pulls that amount in USDT from the seller into the contract as the first-loss buffer via `safeTransferFrom`. Sets status to `Tokenized`. Emits `InvoiceTokenized`.

**invest(uint256 invoiceId, uint256 amount) external**
Only callable when status is `Tokenized`. Validates `block.timestamp < dueDate`. Validates the investment amount, converted at the discount rate, does not push `totalSoldPercentageBps` above 10000. Pulls `amount` in USDT from the investor via `safeTransferFrom` (this amount goes to the seller immediately as their upfront discounted proceeds, matching the real-world factoring flow where the seller gets paid up front). Records `investorContribution[invoiceId][investor] += amount` and updates `totalSoldPercentageBps` accordingly. Adds investor to `invoiceInvestors[invoiceId]` if not already present. Emits `InvestmentMade`.

**repayTokenized(uint256 invoiceId) external**
Only callable by the invoice's buyer, when status is `Tokenized`. Validates `block.timestamp <= dueDate`. Pulls `faceValue` in USDT from the buyer. Deducts the platform fee (0.5% of faceValue) to `platformFeeRecipient`. Sets status to `Repaid`, records `repaidAmount`. Increments `onTimePayments[buyer]`. Checks and grants Trusted status if thresholds are met. If the seller had staked, mark the stake as returnable (do not auto-transfer here, use a separate claim function below to keep this function's gas cost predictable and to follow withdrawal-pattern best practice rather than push-payments to many parties in one transaction). Emits `InvoiceRepaid`.

**claimInvestorShare(uint256 invoiceId) external**
Only callable by an address with a nonzero `investorContribution[invoiceId][msg.sender]`, only after status is `Repaid`. Calculates the investor's proportional share of the net-of-fee repaid amount based on their percentage of `totalSoldPercentageBps`. Transfers that amount via `safeTransfer`. Zeroes out their contribution record to prevent double-claiming. Emits `InvestorClaimed`.

**claimSellerShare(uint256 invoiceId) external**
Only callable by the invoice's seller, only after status is `Repaid`. Calculates the seller's share: the unsold percentage of the net-of-fee repaid amount, plus their original stake if one was made and not consumed. Transfers via `safeTransfer`. Marks as claimed to prevent double-claiming. Emits `SellerClaimed` and, if a stake was returned, `StakeReturned`.

**markDefault(uint256 invoiceId) external**
Callable by anyone (this is a permissionless housekeeping function, common in escrow-style contracts, since it only records a fact that is already true on-chain: the deadline has passed with no repayment). Validates status is `Confirmed` or `Tokenized` (not already `Repaid` or `Defaulted`) and `block.timestamp > dueDate`. Sets status to `Defaulted`. Increments `defaultCount[buyer]`. If the invoice was tokenized and staked, marks the stake as consumed and makes it available for investors to claim as partial compensation via the same `claimInvestorShare` function, adjusted logic to pull from the consumed stake first before falling back to the fact that the buyer never paid (in the no-stake case, investors simply have nothing to claim, consistent with the disclosed risk). Emits `InvoiceDefaulted`.

**claimUsername(string calldata username) external**
Same pattern as described in prior project designs: one username per address, permanent, validated for length (1 to 32 bytes) and uniqueness. Emits `UsernameClaimed`. Charge a small fixed USDT fee for this claim (specify the exact amount, e.g. 1 USDT, in code comments, and document the reasoning: discourages squatting and discourages abandoning a reputation-linked identity to create a fresh one, while explicitly noting in the UI that reputation is tied to wallet address, not username, so this does not actually hide history).

**Internal helper: _checkAndGrantTrusted(address user)**
Checks if `onTimePayments[user] >= TRUSTED_MIN_REPAID` and `defaultCount[user] <= TRUSTED_MAX_DEFAULTS`. If true and not already granted, emits `TrustedStatusGranted`. This is fully automatic and on-chain, with no admin or platform party able to grant or revoke this status manually. This must not be a role or owner-gated function. There must be no way for any single address, including the deployer, to bypass this logic or manually assign Trusted status. This is a deliberate design decision to keep this specific trust signal fully decentralized, in contrast to any future platform-administered identity verification which is explicitly out of scope for this contract and must not be built into it.

### 3.5 Explicit non-goals for this contract (do not implement, document as future roadmap in the feedback file)

- No installment or partial payments before the due date.
- No secondary market for reselling investor positions.
- No third-party or open underwriting market. Only the seller may stake against their own invoice.
- No owner, admin, or pausable role of any kind anywhere in this contract. No function should have an `onlyOwner` modifier. This contract must be genuinely ownerless and immutable in every parameter after deployment, including the fee, the fee recipient, and the token address.
- No platform-administered KYC or business identity verification badge. Only the fully automatic, on-chain track record based Trusted badge described above.
- No grace period logic beyond what is scaffolded in the unused `latePayments` mapping. Document this as reserved for future use.

---

## STAGE 4: CONTRACT TESTING

Before moving to frontend work, write a thorough test suite covering, at minimum:

- Full happy path for direct payment (Scenario 1)
- Full happy path for tokenized invoice with full subscription and full repayment
- Partial subscription (invoice not fully sold), correct split between investors and seller on repayment
- Seller staking, and correct return of stake on successful repayment
- Default with no stake, confirming investors and seller can recover nothing beyond the disclosed risk
- Default with a stake, confirming the stake is correctly made available to investors
- Attempting to pay after the due date reverts
- Attempting to invest after the due date reverts
- Attempting to tokenize an invoice that is not yet confirmed reverts
- Double-claiming attempts by the same investor or seller revert or return zero
- Username claiming, including the uniqueness and fee requirements
- Trusted status correctly triggers after the threshold is met, and correctly does not trigger before
- Rounding and dust handling in proportional distribution across at least three investors with an uneven split, confirming no funds are permanently stuck and any documented dust-handling rule is followed

Run the full test suite and confirm all tests pass before proceeding. Record the test results in the feedback file described at the end of this document.

---

## STAGE 5: DEPLOYMENT CONFIGURATION

Build a deployment script targeting BOT Chain Testnet using the verified chain ID, RPC URL, and USDT address from Stage 1. The constructor takes the USDT token address and the platform fee recipient address as arguments. Set up the project so that a single configuration flag or environment variable can later switch all frontend network configuration to BOT Chain Mainnet, using the verified mainnet chain ID, RPC URL, and USDT address, without requiring any other code changes. Document this switch clearly in `NETWORK_CONFIG.md`, matching the `ACTIVE_NETWORK_KEY` pattern used in this builder's prior BOT Chain projects (a single exported constant in a config file, testnet as the default value).

Deploy to BOT Chain Testnet. Record the deployed contract address, the deployment transaction hash, and a link to the contract on the testnet block explorer in `NETWORK_CONFIG.md`.

---

## STAGE 6: WALLET CONNECTION

Implement wallet connection as follows, in this priority order:

1. **Primary path**: a direct, lightweight EIP-1193 connection flow (`window.ethereum` style, but implemented generically to detect and support any injected EVM wallet, not just MetaMask specifically) for users who already have a browser extension wallet installed. This should feel fast and native, without an unnecessary modal layer, for the common desktop case.
2. **Secondary and fallback path**: Reown AppKit, used specifically for mobile wallet connections (QR code pairing, deep links) and as a fallback for any wallet interaction the primary path does not cleanly support. This mirrors the architecture used in this builder's prior BOT Chain projects, where Reown owns the wallet session and connection lifecycle, and viem owns all chain reads and writes once connected.

The wallet connection UI must look professional: a clean modal or dropdown showing available wallet options, a connected state showing a truncated address (and the claimed username if set), and a clear disconnect option. Support both desktop browser extension wallets and mobile wallet connections through this combined approach.

### Network handling

On connection, check the wallet's current chain ID against the active network (testnet by default, per the configuration switch described in Stage 5). If the wallet is on the wrong network:
- If the wallet does not have BOT Chain configured at all, prompt to add it using `wallet_addEthereumChain` with the correct chain ID, RPC URL, currency symbol, and block explorer URL from the verified values in Stage 1.
- If the wallet already has BOT Chain configured but is on a different network, prompt to switch using `wallet_switchEthereumChain`.
- Display a clear, persistent banner or gate if the user is on the wrong network, blocking write actions until they switch, but still allowing read-only browsing of public data.

---

## STAGE 7: UI AND DESIGN SYSTEM

### 7.1 Visual tone

This is a financial platform. The design must read as professional, precise, and trustworthy rather than decorative or "crypto-flashy." Favor restraint, generous whitespace, and clear data hierarchy over ornamentation. Numbers (amounts, percentages, dates, addresses) are the primary content and must be highly legible, using a font with proper tabular figures so columns of numbers align cleanly.

### 7.2 Color palette

Use the following as the default Tailwind theme configuration. If BOT Chain's official brand colors were successfully retrieved in Stage 1, adjust the `primary` and `primaryStrong` values to match the official brand green while keeping the rest of this muted, desaturated structure. Do not use a vivid neon green as the dominant color; this platform is deliberately more restrained than a typical crypto-native visual style.

```
background:       #12140f
surface:          #1a1d16
surfaceElevated:  #22261c
border:           #2c3024
primary:          #6b9b6e
primaryStrong:    #4d7a52
accentWarn:       #c9a227
danger:           #b5453f
textPrimary:      #eae7dd
textSecondary:    #8f9285
```

Never rely on color alone to indicate a financial state (on time, late, defaulted, at risk). Every color-coded status must also carry an explicit text label and, where practical, an icon, for accessibility.

### 7.3 Typography

Use a clean, technical sans-serif with proper tabular figure support for numerals throughout the interface (Inter or IBM Plex Sans are acceptable choices; verify availability via a CDN import). Use a monospace font specifically for wallet addresses, transaction hashes, and invoice IDs.

### 7.4 Motion and fluidity

Use Framer Motion throughout, applied purposefully:
- Status changes on an invoice (Created, Confirmed, Tokenized, Repaid, Defaulted) must animate as a visible step transition in a status stepper component, not an instant swap.
- All wallet transactions must show an immediate optimistic pending state upon submission (a subtle pulse or loading indicator on the relevant UI element), transitioning to a confirmed state with a brief highlight animation once the transaction receipt is received, and a clear error state with a specific reason if it fails or reverts.
- Numeric values that update due to on-chain events (funding percentage, amounts) should animate from their old value to their new value rather than snapping instantly.
- Use skeleton loading states, not spinners, while historical data loads.
- Apply subtle page transition animations between routes.
- Apply hover and focus states to all interactive elements. Nothing should feel static or dead on interaction.

---

## STAGE 8: PAGE STRUCTURE

Build the following pages. Each must work correctly on both desktop and mobile viewport sizes, tested at common breakpoints.

1. **Landing page**: value proposition, a clear three or four step visual explanation of how the platform works (create, confirm, tokenize or pay, repay and distribute), and a prominent wallet connect call to action. Include a visible, honest risk disclosure summary near the primary call to action, not buried in a footer link, linking to the full Documentation page.

2. **Dashboard**: shown after wallet connection. This is role-aware and must show relevant sections based on the connected address's actual on-chain activity, since one address can simultaneously be a seller, buyer, and investor. Structure it as tabs or clearly separated sections: "As Seller" (invoices they created, tokenization actions, claimable proceeds), "As Buyer" (invoices awaiting their confirmation or payment, their own credit history summary), and "As Investor" (invoices they have invested in, claimable returns). Do not force a single fixed role selection at sign up; derive the relevant sections from actual contract data for the connected address.

3. **Create Invoice**: a form for a seller to create a new invoice, specifying the buyer's address, the amount, and a description. Include address validation and a clear preview of what will be submitted before the transaction is sent.

4. **Invoice Detail page**: accessible via a unique URL per invoice ID. Shows the full state of the invoice: a status stepper, all relevant amounts and dates, funding progress if tokenized (with a progress bar showing percentage sold), staking information if present, and a repayment countdown showing time remaining until the due date. Show contextual action buttons based on both the invoice status and the connected wallet's relationship to it (the assigned buyer sees a Confirm or Pay action, the seller sees a Tokenize or Claim action, a potential investor sees an Invest action if the invoice is tokenized and not yet fully subscribed).

5. **Marketplace**: a public, browsable feed of all currently tokenized invoices open for investment, showing discount rate, amount remaining to be funded, due date, staking status, and the seller's public credit history summary and Trusted badge if earned. Support filtering and sorting by these fields.

6. **Public Profile page**: accessible for any address via a unique URL, showing that address's claimed username if set, their public credit history (counts of on-time payments, late payments if tracked, and defaults), and their Trusted badge status if earned. This page must be viewable by anyone, without needing to connect a wallet, since its purpose is to let potential investors research a buyer or seller before committing funds.

7. **Own Profile and Settings page**: for the connected wallet's own account. Allows claiming a username if not already claimed, displays their own full activity history across all three roles, and displays their own public profile exactly as others would see it, with a clear note that credit history is permanently tied to their wallet address and cannot be altered or hidden.

8. **Documentation page**: a clearly structured page or set of subpages covering: how the platform works for each role, the exact fee structure with a worked numeric example, how first-loss staking works with a worked numeric example, the exact criteria for earning the Trusted badge, and a prominent, plainly worded Risk Disclosure section stating that this is experimental testnet software, that the contract cannot force repayment, that defaults are possible and disclosed, that there is no regulatory protection or legal recourse provided by the contract, and that mainnet deployment (if it occurs) does not change these fundamental risks.

9. **Live Activity page** (optional but recommended): a real-time feed of platform events (invoice created, confirmed, tokenized, invested in, repaid, defaulted) rendered as they occur, using event watching against the deployed contract. Include a live block height indicator for the active network as a visible proof that the connection to the chain is live.

---

## STAGE 9: FINAL VERIFICATION PASS

Once the contract, tests, and frontend are complete, perform the following checks before considering the work finished:

1. Re-run the full contract test suite and confirm every test still passes.
2. Manually trace through each of the three scenarios described in the project overview (direct payment, tokenized factoring with full and partial subscription, and default with and without a stake) against the actual deployed testnet contract, confirming the on-chain state and emitted events match expectations at each step.
3. Confirm the wallet connection flow works for both a simulated desktop injected wallet and the Reown AppKit fallback path.
4. Confirm the network add and switch logic works correctly when starting from a wallet with no BOT Chain network configured, and separately from a wallet already configured but on the wrong network.
5. Check the site at mobile and desktop viewport widths and confirm no layout breakage, overlapping elements, or unreadable text at either size.
6. Re-read all user-facing copy on the site, including the Documentation and Risk Disclosure pages, and confirm no em dashes or other flagged writing patterns are present, and that the tone is plain and professional throughout.
7. Confirm no function in the deployed contract has an owner, admin, or pausable capability of any kind, consistent with the explicit non-goals in Stage 3.5.
8. Confirm the mainnet configuration switch has been implemented and, when toggled in a local test, correctly points all relevant configuration values (chain ID, RPC URL, USDT address, block explorer URL) at the verified mainnet values from Stage 1, without requiring changes anywhere else in the codebase.

---

## REQUIRED DELIVERABLES ALONGSIDE THE CODE

In addition to the full working codebase, produce two additional plain text files at the project root:

### `feedback.txt`
A clear, honest account of what was actually implemented, in what order, and what was observed during the build and testing process. Include:
- Confirmation of which Stage 1 research values were successfully verified, and which could not be confirmed with high confidence, with a note on what was used instead and why.
- Any place where the actual implementation deviated from this specification, and the reasoning for the deviation.
- The results of the test suite run described in Stage 4.
- The results of the final verification pass described in Stage 9.
- Any known limitations, bugs, or rough edges that remain, stated plainly.
- Any design or architecture decision that required judgment not fully specified in this document, and what was decided.

### `steps.txt`
A clear, numbered, step by step guide for the human developer to follow next, covering:
- How to run the project locally for the first time (dependencies, environment variables needed, exact commands).
- How to run the contract test suite.
- How to redeploy the contract if needed, and where the resulting address must be updated in the frontend configuration.
- How to push the project to GitHub, assuming it is not yet connected to a remote repository.
- How to deploy the frontend to Vercel for a demo, including any environment variables that must be configured in the Vercel project settings.
- How to switch the active network from testnet to mainnet when ready, referencing the configuration flag described in Stage 5.
- Any manual verification step the human should personally re-check before sharing the demo link publicly, given that this involves real financial logic.

Write both files in plain, direct language. Do not use em dashes. Do not pad these files with unnecessary enthusiasm or filler; they are working documents, not marketing copy.
