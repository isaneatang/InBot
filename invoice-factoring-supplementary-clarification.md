# SUPPLEMENTARY CLARIFICATION: Contract Precision and UI Detail

This document is a companion to `invoice-factoring-build-prompt.md`. Read both documents in full before writing code. Where this document gives a more specific instruction than the main prompt, follow this document. Where this document is silent on something, follow the main prompt.

---

## PART A: CONTRACT PRECISION

### A.1 Exact math for tokenization and investment

All percentages are represented in basis points (bps), where 10000 bps equals 100 percent. Do this to avoid floating point entirely, since Solidity has no native decimals.

When a seller calls `tokenizeInvoice(invoiceId, discountBps, stakeAmount)`:
- `discountBps` represents the rate at which the invoice is being sold, for example 8500 means investors pay 85 percent of face value to receive 100 percent of face value at repayment, proportional to what they bought.
- Enforce `discountBps >= 5000 && discountBps <= 9900`. Reject anything below 50 percent (uneconomical for the seller in essentially all cases and likely a user input error) and anything at or above 100 percent (an investor buying at 100 percent of face value for a promise of face value has no yield and no reason to accept default risk, so this is also almost certainly a user error). Use a custom error, for example `error InvalidDiscountRate(uint256 provided)`, rather than a plain require string, for gas efficiency and clarity.

When an investor calls `invest(invoiceId, amount)`, where `amount` is the USDT amount they are contributing at the discounted rate:
- Calculate the percentage of face value this contribution represents: `percentageBps = (amount * 10000 * 10000) / (invoice.faceValue * invoice.discountBps)`. Walk through this carefully: if the discount is 8500 bps and the investor contributes an amount equal to 8.5 percent of face value, they should receive 10 percent of face value at repayment, since `amount / discountBps` as a ratio, scaled correctly, gives the equivalent face-value percentage they are purchasing.
- Reject the investment if `invoice.totalSoldPercentageBps + percentageBps > 10000`, using a custom error such as `error ExceedsAvailablePercentage(uint256 requested, uint256 available)`.
- Update `invoice.totalSoldPercentageBps += percentageBps` and record `investorContribution[invoiceId][msg.sender] += amount` (accumulate rather than overwrite, in case the same investor invests more than once in the same invoice).
- If this is the investor's first contribution to this invoice, push their address to `invoiceInvestors[invoiceId]`. Guard against duplicate entries in this array if they invest again later, by checking `investorContribution[invoiceId][msg.sender] == 0` before the update, immediately before adding to the array, rather than searching the array each time, which would be more gas expensive.

### A.2 Exact math for distribution on repayment

When `repayTokenized` is called and the buyer pays `invoice.faceValue` in full:
- `fee = (invoice.faceValue * PLATFORM_FEE_BPS) / 10000`
- `netRepaid = invoice.faceValue - fee`
- Transfer `fee` to `platformFeeRecipient` immediately within this function.
- Store `invoice.repaidAmount = netRepaid` for use by the later claim functions. Do not distribute to individual investors within this same function. Use the pull pattern: investors and the seller each call their own claim function afterward. This avoids a single transaction having to loop over an unbounded number of investors, which is a real gas and denial of service risk if a popular invoice attracts many small investors.

In `claimInvestorShare(invoiceId)`:
- `investorShare = (invoice.repaidAmount * investorPercentageOfThisInvestor) / 10000`, where the investor's individual percentage was calculated and would need to be stored per investor at investment time, not only the running total. Add a field to track this explicitly: `mapping(uint256 => mapping(address => uint256)) public investorPercentageBps`, set at the same time as `investorContribution` in the `invest` function.
- After transferring, set `investorPercentageBps[invoiceId][msg.sender] = 0` and `investorContribution[invoiceId][msg.sender] = 0` to prevent double-claiming.

In `claimSellerShare(invoiceId)`:
- `sellerPercentageBps = 10000 - invoice.totalSoldPercentageBps`
- `sellerShare = (invoice.repaidAmount * sellerPercentageBps) / 10000`
- If `invoice.stakedAmount > 0 && !invoice.stakeConsumed`, add `invoice.stakedAmount` to the amount transferred to the seller in this same call, and emit `StakeReturned` in addition to `SellerClaimed`.
- Use a boolean flag `sellerHasClaimed` on the invoice struct (add this field, it was omitted in the main prompt's struct and must be added) to prevent double-claiming, since the seller's claim is a single lump action unlike investors who each have their own independent balance naturally zeroed by the mapping update.

### A.3 Rounding and dust handling, stated explicitly

Because of integer division, the sum of all `investorShare` calculations plus the `sellerShare` calculation may not exactly equal `netRepaid` due to truncation. This will always leave the contract holding a small amount of leftover USDT (at most a few units, never more than the number of separate claims), never a large or economically meaningful amount.

Do not attempt to solve this by having a designated final claimant collect "whatever is left," as this creates an unfair race condition and inconsistent behavior depending on claim order. Instead, implement a separate function, `sweepDust(uint256 invoiceId) external`, callable by anyone, only after both the seller and all investors have claimed (track this with a counter of claims made versus `invoiceInvestors[invoiceId].length + 1`), which transfers any remaining balance held against that invoice's accounting to `platformFeeRecipient`. Document this function's purpose clearly in its NatSpec comment so it is not mistaken for an admin fund-sweeping mechanism, since it is fully permissionless, only ever moves genuinely leftover dust, and only becomes callable after all rightful claims are settled.

### A.4 Default and stake consumption, precise sequence

When `markDefault(invoiceId)` is called on a tokenized invoice with a nonzero stake:
- Set `invoice.status = InvoiceStatus.Defaulted`.
- Set `invoice.stakeConsumed = true`.
- Set `invoice.repaidAmount = invoice.stakedAmount` (treat the stake as if it were the repayment amount, for the purpose of reusing the exact same `claimInvestorShare` proportional math already written, rather than writing a separate distribution formula for the default case).
- In this case there is no `sellerShare` to claim, since the seller's stake has been fully consumed to cover investors and the seller receives nothing (they already received their upfront discounted proceeds at the time of tokenization, and that is the extent of what they get if the buyer defaults). Ensure `claimSellerShare` explicitly reverts with a clear custom error if called on a `Defaulted` invoice with a consumed stake, rather than silently returning zero, so the seller receives a clear explanation rather than a confusing empty transaction.
- If there was no stake at all (`invoice.stakedAmount == 0`), investors have nothing to claim. `claimInvestorShare` should check the invoice status and revert with a specific custom error such as `error NoStakeToClaim()` if called on a defaulted, unstaked invoice, rather than allowing a confusing zero-value transaction to succeed.

### A.5 Required custom errors (use these instead of require strings throughout, for gas efficiency and clarity)

```solidity
error NotAuthorized();
error InvalidStatus();
error PastDueDate();
error NotYetDue();
error InvalidDiscountRate(uint256 provided);
error ExceedsAvailablePercentage(uint256 requested, uint256 available);
error AlreadyClaimed();
error NoStakeToClaim();
error UsernameTaken();
error UsernameAlreadySet();
error ZeroAddress();
error ZeroAmount();
```

Use these consistently rather than a mix of require strings and custom errors.

### A.6 Struct correction

Add the following fields to the `Invoice` struct given in the main prompt, which were needed for the logic above but omitted there:

```solidity
bool sellerHasClaimed;
```

And add the per-investor percentage mapping described in A.2:

```solidity
mapping(uint256 => mapping(address => uint256)) public investorPercentageBps;
```

---

## PART B: UI DETAIL

### B.1 Spacing and sizing scale

Use Tailwind's default spacing scale without customization, but standardize on these values as the only ones used throughout the project, to keep visual rhythm consistent: `2, 4, 6, 8, 12, 16, 24, 32, 48, 64` (in Tailwind's unit system, so `p-4`, `p-6`, `gap-8`, and so on). Do not introduce arbitrary one-off spacing values.

Card corner radius: consistently `rounded-lg` (8px) for all cards and panels, `rounded-md` (6px) for buttons and inputs, `rounded-full` only for badges and avatars. Do not mix radius sizes inconsistently across similar components.

### B.2 Responsive breakpoints

Design mobile-first. Use Tailwind's default breakpoints: base styles for mobile (below 640px), `sm:` for 640px and up, `md:` for 768px and up, `lg:` for 1024px and up. The Dashboard and Marketplace pages, which show data-dense card grids, should show a single column below `md:`, two columns at `md:`, and three columns at `lg:` and above. The Invoice Detail page should stack the status stepper above the action panel on mobile, and show them side by side at `lg:` and above.

### B.3 Component-level detail per page

**Wallet connect button (used in the navbar on every page)**
Unconnected state: a solid button using the `primary` color, label "Connect Wallet." Clicking opens a modal with two clearly separated sections: "Browser Wallet" (attempts direct EIP-1193 connection, shown first since it is the primary path) and "Mobile or Other Wallets" (triggers the Reown AppKit flow). Connected state: replaces the button with a pill-shaped element showing a colored dot indicating network status (green dot if on the correct BOT Chain network, amber dot with a tooltip if on the wrong network), the truncated address or claimed username, and a small chevron that opens a dropdown with "View Profile," "Copy Address," and "Disconnect."

**Status stepper component (used on Invoice Detail and within Dashboard invoice cards)**
A horizontal row of five nodes representing Created, Confirmed, Tokenized (skipped and visually grayed out if the invoice went the direct payment route instead), Repaid, and Defaulted (this final node only appears in place of Repaid if that outcome occurred, they are mutually exclusive end states, not both shown as future possibilities). Completed steps are filled with `primary` color and connected by a solid line. The current step pulses gently using Framer Motion. Future steps are outlined only, in `border` color. A defaulted invoice shows its final node in `danger` color with the word "Defaulted" explicitly labeled beside it, never relying on color alone.

**Invoice card (used in Dashboard lists and Marketplace grid)**
A `surface` colored card with `rounded-lg` corners. Top row: invoice ID in monospace, status stepper in compact form. Middle: face value in large, bold, tabular-figure text, with the description beneath it in `textSecondary` color, truncated with an ellipsis if long. If tokenized, a funding progress bar beneath the amount, filled proportionally to `totalSoldPercentageBps`, with the percentage as text overlaid or beside it, animating its fill using Framer Motion whenever the underlying value changes. Bottom row: due date with a relative time label (for example "3 days remaining" or "Overdue by 2 days" in `danger` color), and a small badge showing the counterparty's Trusted status if applicable. The entire card is clickable, navigating to the Invoice Detail page, with a hover state that raises the card slightly using a subtle shadow and scale transform.

**Create Invoice form**
A single centered card, maximum width around 480px on larger screens, full width on mobile. Fields in order: buyer wallet address (with inline validation showing a red border and error text if the format is invalid or matches the connected wallet's own address), amount in USDT (numeric input, reject negative or zero values inline), description (a textarea, character limit clearly shown, for example "120/280 characters"). A summary panel beneath the form, updating live as fields are filled, showing exactly what will be submitted. The submit button is disabled until all fields are valid, and shows a loading spinner state while the transaction is pending, changing to a success checkmark animation on confirmation before redirecting to the new Invoice Detail page.

**Marketplace filter bar**
A horizontal bar above the invoice grid (collapsing into a single "Filters" button that opens a bottom sheet on mobile) with controls for minimum discount rate (a slider), maximum days until due date (a slider or select), "Staked only" (a toggle), and a sort dropdown (Newest, Highest Discount, Most Funded, Least Funded, Due Soonest).

**Public Profile page**
Header section: claimed username in large text if set, otherwise the truncated address, with the full address always shown beneath in monospace regardless. A Trusted badge, if earned, shown as a small pill with a checkmark icon and the word "Trusted," with a tooltip or adjacent link explaining exactly how this status is earned (linking to the Documentation page's relevant section, never leaving it unexplained). Beneath this, three stat blocks in a row (stacking vertically on mobile): "On-Time Payments," "Late Payments," "Defaults," each with the count in large tabular-figure text. Beneath that, a tabbed or sectioned list of the address's invoices in each of the three roles, reusing the invoice card component from above.

**Documentation and Risk Disclosure page**
Use a two-column layout on desktop: a sticky sidebar with anchor links to each subsection (How It Works, Fees, Staking, Trusted Badge Criteria, Risk Disclosure), collapsing to a top dropdown navigation on mobile. The Risk Disclosure subsection must be visually distinct, for example with a bordered callout box using the `accentWarn` color for its border, not its fill, to draw attention without alarming, containing the plainly worded risk statements specified in the main prompt.

### B.4 Animation timing specifics

Use these Framer Motion timing values consistently rather than ad hoc values per component:
- Page transitions: 200ms fade combined with a small 8px vertical slide, ease-out.
- Card hover elevation: 150ms, ease-out.
- Status stepper node completion: 300ms scale and color transition, ease-in-out.
- Numeric value counting animation: 500ms, ease-out, using a simple interpolation between old and new values rather than a physics-based spring, since financial figures should settle predictably rather than bounce.
- Optimistic pending state pulse: a continuous, slow opacity pulse, 1.5 second cycle, ease-in-out, looping until resolved.
- Toast or confirmation notifications: slide in from the top-right over 250ms, remain for 4 seconds unless it represents an error (remain until manually dismissed for errors, since financial error messages should not disappear before the user has read them).

### B.5 Empty, loading, and error states

Every page or section that loads on-chain data must explicitly handle three states, not just the successful data state:
- **Loading**: skeleton placeholders matching the approximate shape of the eventual content, not a centered spinner, for the Dashboard, Marketplace, and Public Profile pages. A centered spinner is acceptable only for short, single-action loading moments such as a transaction confirmation.
- **Empty**: a clear, specific message for each context, for example "You have not created any invoices yet" on an empty Seller dashboard tab, paired with a call to action button to create one. Do not show a generic "No data" message anywhere.
- **Error**: if a contract read fails or the RPC connection is unavailable, show a clear message distinguishing between "the network is unreachable, try again" and "you appear to be on the wrong network," since these require different user actions to resolve.
