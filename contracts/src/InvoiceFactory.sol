// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title InvoiceFactory
/// @notice Decentralized invoice factoring platform for BOT Chain.
/// @dev A seller issues an on-chain invoice to a buyer. The buyer confirms the invoice and
///      sets a repayment due date. The buyer can pay directly, or the seller can tokenize
///      the unpaid invoice and sell fractional shares to investors at a discount. On
///      repayment, funds are distributed proportionally to investors and the seller.
///      The contract is deliberately ownerless and immutable after deployment: no fee,
///      fee recipient, token, threshold, or admin capability can ever be changed.
/// @dev This is experimental testnet software. The contract cannot force a buyer to pay,
///      so default risk is real, disclosed, and priced through the discount mechanism.
contract InvoiceFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------ */
    /* Custom errors                                                       */
    /* ------------------------------------------------------------------ */

    /// @notice Caller is not authorized to perform this action on the target invoice.
    error NotAuthorized();
    /// @notice The invoice is not in the expected state for this action.
    error InvalidStatus();
    /// @notice The action is not permitted because the invoice due date has already passed.
    error PastDueDate();
    /// @notice The supplied due date is not strictly in the future.
    error NotYetDue();
    /// @notice A tokenization discount rate outside the permitted band was provided.
    error InvalidDiscountRate(uint256 provided);
    /// @notice The requested investment would exceed the remaining sellable percentage.
    error ExceedsAvailablePercentage(uint256 requested, uint256 available);
    /// @notice The claimant has already claimed their share for this invoice.
    error AlreadyClaimed();
    /// @notice A defaulted, unstaked invoice has nothing for investors to claim.
    error NoStakeToClaim();
    /// @notice Dust cannot be swept until every rightful claimant has settled.
    error ClaimsPending(uint256 settled, uint256 expected);
    /// @notice The requested username is already owned by another address.
    error UsernameTaken();
    /// @notice The caller has already claimed a username.
    error UsernameAlreadySet();
    /// @notice A required address argument is the zero address.
    error ZeroAddress();
    /// @notice An amount argument is required to be greater than zero.
    error ZeroAmount();
    /// @notice The seller and buyer of an invoice cannot be the same address.
    error InvalidBuyer();
    /// @notice The referenced invoice id does not exist.
    error InvalidInvoice();
    /// @notice The provided username does not meet the 1 to 32 byte rule.
    error InvalidUsername();
    /// @notice The seller has no claimable share for this invoice.
    error NoSellerShare();

    /* ------------------------------------------------------------------ */
    /* Enums and structs                                                   */
    /* ------------------------------------------------------------------ */

    enum InvoiceStatus { Created, Confirmed, Tokenized, Repaid, Defaulted }

    /// @notice Full state record for a single invoice.
    struct Invoice {
        /// @notice Address that issued the invoice and will receive proceeds.
        address seller;
        /// @notice Address that owes the face value and confirms the invoice.
        address buyer;
        /// @notice Amount the buyer owes, in USDT smallest unit.
        uint256 faceValue;
        /// @notice Free text description of the goods or services invoiced.
        string description;
        /// @notice Unix timestamp by which the buyer must repay.
        uint256 dueDate;
        /// @notice Current lifecycle stage of the invoice.
        InvoiceStatus status;
        /// @notice Unix timestamp when the invoice was created.
        uint256 createdAt;
        /// @notice Unix timestamp when the buyer confirmed the invoice.
        uint256 confirmedAt;
        /// @notice Percentage of the invoice sold to investors, in basis points (0 to 10000).
        uint256 totalSoldPercentageBps;
        /// @notice Discount rate at tokenization, in basis points (e.g. 8500 = 85%).
        uint256 discountBps;
        /// @notice Seller's optional first-loss buffer, in USDT smallest unit. 0 if none.
        uint256 stakedAmount;
        /// @notice True once the stake has been consumed to cover a default shortfall.
        bool stakeConsumed;
        /// @notice Net-of-fee amount repaid by the buyer and available for distribution.
        uint256 repaidAmount;
        /// @notice True once the seller has claimed their share, to prevent double claims.
        bool sellerHasClaimed;
        /// @notice Running total already paid out to investors and the seller.
        uint256 distributedAmount;
        /// @notice Number of successful share claims made against this invoice.
        uint256 claimsMade;
        /// @notice Total USDT the contract holds on behalf of this invoice's claimants.
        /// @dev Equals the net repayment plus any still-locked stake once settled. Used by
        ///      sweepDust to compute genuine leftovers without touching other invoices' funds.
        uint256 poolAmount;
        /// @notice Denominator, in basis points, used to split repaidAmount between claimants.
        /// @dev 10000 on a normal repayment, so investors take their purchased percentage of
        ///      the whole and the seller keeps the unsold remainder. On a default the stake is
        ///      the only pool and it belongs entirely to investors, so this becomes
        ///      totalSoldPercentageBps and investors split the full stake between themselves.
        uint256 distributionBasisBps;
    }

    /* ------------------------------------------------------------------ */
    /* State variables                                                     */
    /* ------------------------------------------------------------------ */

    /// @notice ERC20 token used for all payments and investments (USDT on BOT Chain).
    address public immutable usdtToken;

    /// @notice Address that receives the platform fee on every settled payment.
    address public immutable platformFeeRecipient;

    /// @notice Platform fee taken from each payment, in basis points. 0.5%.
    uint16 public constant PLATFORM_FEE_BPS = 50;

    /// @notice Fixed fee in USDT smallest unit charged to claim a username (1 USDT).
    /// @dev Discourages squatting and abandoning a reputation-linked identity. Reputation
    ///      remains tied to the wallet address, so this does not hide any history.
    uint256 public constant USERNAME_FEE = 1e6;

    /// @notice Monotonic counter used to assign the next invoice id.
    uint256 public nextInvoiceId;

    /// @notice Mapping from invoice id to its full invoice record.
    mapping(uint256 => Invoice) public invoices;

    /// @notice Mapping from invoice id and investor to the amount contributed in USDT.
    mapping(uint256 => mapping(address => uint256)) public investorContribution;

    /// @notice Mapping from invoice id and investor to their purchased percentage in bps.
    mapping(uint256 => mapping(address => uint256)) public investorPercentageBps;

    /// @notice Mapping from invoice id to the list of investors who contributed.
    mapping(uint256 => address[]) public invoiceInvestors;

    /// @notice Mapping from address to its claimed public username.
    mapping(address => string) public addressToUsername;

    /// @notice Mapping from username to the address that owns it.
    mapping(string => address) public usernameToAddress;

    /// @notice Count of on-time repayments per address, the basis for the Trusted badge.
    mapping(address => uint256) public onTimePayments;

    /// @notice Count of late payments per address. Reserved for future grace period logic.
    mapping(address => uint256) public latePayments;

    /// @notice Count of defaults recorded per address.
    mapping(address => uint256) public defaultCount;

    /// @notice True once an address has met the Trusted thresholds at least once.
    /// @dev Written only by _checkAndGrantTrusted, which is driven purely by repayment
    ///      history. There is no setter and no privileged path to it.
    mapping(address => bool) public isTrusted;

    /// @notice Minimum on-time repayments required to earn the Trusted badge.
    uint256 public constant TRUSTED_MIN_REPAID = 5;

    /// @notice Maximum permitted defaults while remaining Trusted (zero means none allowed).
    uint256 public constant TRUSTED_MAX_DEFAULTS = 0;

    /// @notice Minimum discount accepted at tokenization, in basis points (50%).
    uint256 public constant MIN_DISCOUNT_BPS = 5000;

    /// @notice Maximum discount accepted at tokenization, in basis points (99%).
    uint256 public constant MAX_DISCOUNT_BPS = 9900;

    /* ------------------------------------------------------------------ */
    /* Events                                                              */
    /* ------------------------------------------------------------------ */

    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed seller,
        address indexed buyer,
        uint256 faceValue,
        string description,
        uint256 timestamp
    );
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

    /* ------------------------------------------------------------------ */
    /* Constructor                                                         */
    /* ------------------------------------------------------------------ */

    /// @notice Deploys the immutable factoring contract.
    /// @param usdtToken_ Address of the USDT token used for all value flows.
    /// @param platformFeeRecipient_ Address that receives platform fees.
    constructor(address usdtToken_, address platformFeeRecipient_) {
        if (usdtToken_ == address(0)) revert ZeroAddress();
        if (platformFeeRecipient_ == address(0)) revert ZeroAddress();
        usdtToken = usdtToken_;
        platformFeeRecipient = platformFeeRecipient_;
    }

    /* ------------------------------------------------------------------ */
    /* Modifiers and helpers                                               */
    /* ------------------------------------------------------------------ */

    /// @notice Reverts unless the referenced invoice exists.
    /// @param invoiceId The invoice id to validate.
    function _requireExists(uint256 invoiceId) internal view {
        if (invoiceId >= nextInvoiceId) revert InvalidInvoice();
    }

    /* ------------------------------------------------------------------ */
    /* Invoice lifecycle                                                   */
    /* ------------------------------------------------------------------ */

    /// @notice Creates a new invoice in Created status.
    /// @param buyer The address that owes the invoice.
    /// @param faceValue The amount owed, in USDT smallest unit.
    /// @param description Free-text description of the invoice.
    /// @return The assigned invoice id.
    function createInvoice(address buyer, uint256 faceValue, string calldata description)
        external
        returns (uint256)
    {
        if (buyer == address(0)) revert ZeroAddress();
        if (buyer == msg.sender) revert InvalidBuyer();
        if (faceValue == 0) revert ZeroAmount();

        uint256 invoiceId = nextInvoiceId++;
        Invoice storage inv = invoices[invoiceId];
        inv.seller = msg.sender;
        inv.buyer = buyer;
        inv.faceValue = faceValue;
        inv.description = description;
        inv.status = InvoiceStatus.Created;
        inv.createdAt = block.timestamp;

        emit InvoiceCreated(invoiceId, msg.sender, buyer, faceValue, description, block.timestamp);
        return invoiceId;
    }

    /// @notice Buyer confirms an invoice and sets the repayment due date.
    /// @param invoiceId The invoice to confirm.
    /// @param dueDate The repayment deadline, a Unix timestamp strictly in the future.
    function confirmInvoice(uint256 invoiceId, uint256 dueDate) external {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.buyer != msg.sender) revert NotAuthorized();
        if (inv.status != InvoiceStatus.Created) revert InvalidStatus();
        if (dueDate <= block.timestamp) revert NotYetDue();

        inv.status = InvoiceStatus.Confirmed;
        inv.confirmedAt = block.timestamp;
        inv.dueDate = dueDate;

        emit InvoiceConfirmed(invoiceId, msg.sender, dueDate, block.timestamp);
    }

    /// @notice Buyer pays the invoice in full before the due date, without tokenization.
    /// @param invoiceId The invoice to pay.
    function payDirect(uint256 invoiceId) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.buyer != msg.sender) revert NotAuthorized();
        if (inv.status != InvoiceStatus.Confirmed) revert InvalidStatus();
        if (block.timestamp > inv.dueDate) revert PastDueDate();

        uint256 fee = (inv.faceValue * PLATFORM_FEE_BPS) / 10000;
        uint256 net = inv.faceValue - fee;

        IERC20(usdtToken).safeTransferFrom(msg.sender, address(this), inv.faceValue);
        IERC20(usdtToken).safeTransfer(platformFeeRecipient, fee);

        inv.status = InvoiceStatus.Repaid;
        inv.repaidAmount = net;
        inv.poolAmount = net;
        inv.distributionBasisBps = 10000;

        onTimePayments[msg.sender] += 1;
        _checkAndGrantTrusted(msg.sender);

        emit InvoicePaidDirect(invoiceId, msg.sender, inv.faceValue, fee, block.timestamp);
    }

    /// @notice Seller tokenizes a confirmed, unpaid invoice, offering it to investors.
    /// @param invoiceId The invoice to tokenize.
    /// @param discountBps The discount rate, in basis points, between 5000 and 9900.
    /// @param stakeAmount Optional first-loss stake the seller locks as a buffer.
    function tokenizeInvoice(uint256 invoiceId, uint256 discountBps, uint256 stakeAmount) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.seller != msg.sender) revert NotAuthorized();
        if (inv.status != InvoiceStatus.Confirmed) revert InvalidStatus();
        if (block.timestamp >= inv.dueDate) revert PastDueDate();
        if (discountBps < MIN_DISCOUNT_BPS || discountBps > MAX_DISCOUNT_BPS) revert InvalidDiscountRate(discountBps);

        if (stakeAmount > 0) {
            IERC20(usdtToken).safeTransferFrom(msg.sender, address(this), stakeAmount);
        }

        inv.status = InvoiceStatus.Tokenized;
        inv.discountBps = discountBps;
        inv.stakedAmount = stakeAmount;
        inv.stakeConsumed = false;

        emit InvoiceTokenized(invoiceId, msg.sender, discountBps, stakeAmount, block.timestamp);
    }

    /// @notice An investor buys a share of a tokenized invoice at the discount rate.
    /// @param invoiceId The tokenized invoice to invest in.
    /// @param amount The USDT amount the investor contributes at the discounted rate.
    function invest(uint256 invoiceId, uint256 amount) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Tokenized) revert InvalidStatus();
        if (block.timestamp >= inv.dueDate) revert PastDueDate();
        if (amount == 0) revert ZeroAmount();

        uint256 percentageBps = (amount * 10000 * 10000) / (inv.faceValue * inv.discountBps);
        if (inv.totalSoldPercentageBps + percentageBps > 10000) {
            revert ExceedsAvailablePercentage(percentageBps, 10000 - inv.totalSoldPercentageBps);
        }

        bool isFirstContribution = investorContribution[invoiceId][msg.sender] == 0;
        if (isFirstContribution) {
            invoiceInvestors[invoiceId].push(msg.sender);
        }

        investorContribution[invoiceId][msg.sender] += amount;
        investorPercentageBps[invoiceId][msg.sender] += percentageBps;
        inv.totalSoldPercentageBps += percentageBps;

        IERC20(usdtToken).safeTransferFrom(msg.sender, inv.seller, amount);

        emit InvestmentMade(invoiceId, msg.sender, amount, percentageBps, block.timestamp);
    }

    /// @notice Buyer repays a tokenized invoice in full before the due date.
    /// @param invoiceId The tokenized invoice to repay.
    function repayTokenized(uint256 invoiceId) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.buyer != msg.sender) revert NotAuthorized();
        if (inv.status != InvoiceStatus.Tokenized) revert InvalidStatus();
        if (block.timestamp > inv.dueDate) revert PastDueDate();

        uint256 fee = (inv.faceValue * PLATFORM_FEE_BPS) / 10000;
        uint256 net = inv.faceValue - fee;

        IERC20(usdtToken).safeTransferFrom(msg.sender, address(this), inv.faceValue);
        IERC20(usdtToken).safeTransfer(platformFeeRecipient, fee);

        inv.status = InvoiceStatus.Repaid;
        inv.repaidAmount = net;
        // The stake is still held by the contract and returns to the seller on their claim,
        // so it counts towards the pool that must be fully drained before dust can be swept.
        inv.poolAmount = net + inv.stakedAmount;
        inv.distributionBasisBps = 10000;

        onTimePayments[msg.sender] += 1;
        _checkAndGrantTrusted(msg.sender);

        emit InvoiceRepaid(invoiceId, msg.sender, inv.faceValue, fee, block.timestamp);
    }

    /// @notice An investor claims their proportional share of a repaid or staked-default invoice.
    /// @param invoiceId The invoice the caller invested in.
    /// @dev On a normal repayment the basis is 10000, so an investor receives exactly the
    ///      percentage of face value they purchased. On a default the consumed stake is the
    ///      only pool and it exists solely to protect investors, so the basis is the sold
    ///      percentage and investors split the whole stake between themselves.
    function claimInvestorShare(uint256 invoiceId) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];

        if (inv.status != InvoiceStatus.Repaid && inv.status != InvoiceStatus.Defaulted) revert InvalidStatus();
        if (inv.status == InvoiceStatus.Defaulted && !inv.stakeConsumed) revert NoStakeToClaim();

        uint256 contribution = investorContribution[invoiceId][msg.sender];
        if (contribution == 0) revert NotAuthorized();

        uint256 percentage = investorPercentageBps[invoiceId][msg.sender];
        uint256 basis = inv.distributionBasisBps;
        uint256 share = basis == 0 ? 0 : (inv.repaidAmount * percentage) / basis;

        investorContribution[invoiceId][msg.sender] = 0;
        investorPercentageBps[invoiceId][msg.sender] = 0;
        inv.distributedAmount += share;
        inv.claimsMade += 1;

        if (share > 0) {
            IERC20(usdtToken).safeTransfer(msg.sender, share);
        }

        emit InvestorClaimed(invoiceId, msg.sender, share, block.timestamp);
    }

    /// @notice The seller claims their share of a repaid invoice, plus stake return if applicable.
    /// @param invoiceId The id of the invoice being claimed.
    /// @dev On a default the seller has no claim on the face value: they already received their
    ///      discounted proceeds at tokenization and that is the extent of it. The one exception
    ///      is a defaulted invoice that attracted no investors at all, where the stake was never
    ///      consumed because there was nobody for it to protect, so it returns to the seller.
    function claimSellerShare(uint256 invoiceId) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.seller != msg.sender) revert NotAuthorized();

        if (inv.status == InvoiceStatus.Defaulted) {
            if (inv.stakeConsumed || inv.stakedAmount == 0) revert NoSellerShare();
            if (inv.sellerHasClaimed) revert AlreadyClaimed();

            uint256 stake = inv.stakedAmount;
            inv.sellerHasClaimed = true;
            inv.distributedAmount += stake;
            inv.claimsMade += 1;

            IERC20(usdtToken).safeTransfer(msg.sender, stake);

            emit SellerClaimed(invoiceId, msg.sender, 0, block.timestamp);
            emit StakeReturned(invoiceId, msg.sender, stake, block.timestamp);
            return;
        }

        if (inv.status != InvoiceStatus.Repaid) revert InvalidStatus();
        if (inv.sellerHasClaimed) revert AlreadyClaimed();

        uint256 sellerPercentageBps = 10000 - inv.totalSoldPercentageBps;
        uint256 sellerShare = (inv.repaidAmount * sellerPercentageBps) / 10000;

        uint256 amountToSend = sellerShare;
        bool stakeReturned = false;
        if (inv.stakedAmount > 0 && !inv.stakeConsumed) {
            amountToSend += inv.stakedAmount;
            stakeReturned = true;
        }

        inv.sellerHasClaimed = true;
        inv.distributedAmount += amountToSend;
        inv.claimsMade += 1;

        IERC20(usdtToken).safeTransfer(msg.sender, amountToSend);

        emit SellerClaimed(invoiceId, msg.sender, sellerShare, block.timestamp);
        if (stakeReturned) {
            emit StakeReturned(invoiceId, msg.sender, inv.stakedAmount, block.timestamp);
        }
    }

    /// @notice Permissionless housekeeping that records a default once the due date has passed.
    /// @param invoiceId The overdue invoice to mark as defaulted.
    /// @dev Anyone may call this because it only records a fact already true on-chain: the
    ///      deadline passed without repayment. A stake is consumed only when there are
    ///      investors for it to protect. If the invoice was tokenized but nobody invested,
    ///      the stake stays intact and the seller can reclaim it.
    function markDefault(uint256 invoiceId) external {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Confirmed && inv.status != InvoiceStatus.Tokenized) revert InvalidStatus();
        if (block.timestamp <= inv.dueDate) revert NotYetDue();

        bool wasTokenized = inv.status == InvoiceStatus.Tokenized;
        inv.status = InvoiceStatus.Defaulted;
        defaultCount[inv.buyer] += 1;

        if (wasTokenized && inv.stakedAmount > 0) {
            inv.poolAmount = inv.stakedAmount;
            if (inv.totalSoldPercentageBps > 0) {
                // The stake exists to absorb investor losses first, so the entire stake is
                // shared out between the investors in proportion to what they bought,
                // regardless of how much of the invoice went unsold.
                inv.stakeConsumed = true;
                inv.repaidAmount = inv.stakedAmount;
                inv.distributionBasisBps = inv.totalSoldPercentageBps;
            }
        }

        emit InvoiceDefaulted(invoiceId, inv.buyer, block.timestamp);
    }

    /// @notice Permissionless distribution of genuine leftover dust to the fee recipient.
    /// @param invoiceId The id of the invoice whose leftovers are being swept.
    /// @dev Only callable once every rightful claimant has settled. The amount moved is the
    ///      difference between the pool held for this invoice and the sum of all shares
    ///      actually paid out, which integer division keeps to at most one unit per claim.
    ///      This is not an admin sweep: it is fully permissionless, it cannot run while any
    ///      claim is still outstanding, and it can only ever move truncation remainders.
    function sweepDust(uint256 invoiceId) external {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Repaid && inv.status != InvoiceStatus.Defaulted) revert InvalidStatus();

        uint256 expectedClaims = _expectedClaims(inv, invoiceId);
        if (inv.claimsMade < expectedClaims) revert ClaimsPending(inv.claimsMade, expectedClaims);

        uint256 leftover = inv.poolAmount > inv.distributedAmount ? inv.poolAmount - inv.distributedAmount : 0;
        if (leftover > 0) {
            inv.distributedAmount += leftover;
            IERC20(usdtToken).safeTransfer(platformFeeRecipient, leftover);
        }
    }

    /// @notice Number of claims that must settle before this invoice's dust can be swept.
    /// @param inv The invoice record.
    /// @param invoiceId The invoice id, needed to size the investor list.
    function _expectedClaims(Invoice storage inv, uint256 invoiceId) internal view returns (uint256) {
        uint256 investors = invoiceInvestors[invoiceId].length;
        if (inv.status == InvoiceStatus.Defaulted) {
            // Investors can only claim when the stake was consumed. The seller claims only
            // in the mirror case, where an unconsumed stake returns to them.
            if (inv.stakeConsumed) return investors;
            return inv.stakedAmount > 0 ? 1 : 0;
        }
        return investors + 1;
    }

    /* ------------------------------------------------------------------ */
    /* Identity and reputation                                             */
    /* ------------------------------------------------------------------ */

    /// @notice Claims a permanent public username for the caller, once, for a fixed fee.
    /// @param username The username, between 1 and 32 bytes.
    function claimUsername(string calldata username) external nonReentrant {
        uint256 len = bytes(username).length;
        if (len == 0 || len > 32) revert InvalidUsername();
        if (usernameToAddress[username] != address(0)) revert UsernameTaken();
        if (bytes(addressToUsername[msg.sender]).length > 0) revert UsernameAlreadySet();

        IERC20(usdtToken).safeTransferFrom(msg.sender, platformFeeRecipient, USERNAME_FEE);

        addressToUsername[msg.sender] = username;
        usernameToAddress[username] = msg.sender;

        emit UsernameClaimed(msg.sender, username, block.timestamp);
    }

    /// @dev Automatically grants the Trusted badge based purely on repayment history.
    /// @param user The address whose repayment record is being checked.
    /// @dev No address, including the deployer, can grant or revoke this status. It is the
    ///      mechanical result of onTimePayments and defaultCount meeting the thresholds. The
    ///      event fires once, on the repayment that first crosses the threshold.
    function _checkAndGrantTrusted(address user) internal {
        if (isTrusted[user]) return;
        if (onTimePayments[user] >= TRUSTED_MIN_REPAID && defaultCount[user] <= TRUSTED_MAX_DEFAULTS) {
            isTrusted[user] = true;
            emit TrustedStatusGranted(user, block.timestamp);
        }
    }

    /* ------------------------------------------------------------------ */
    /* View helpers                                                        */
    /* ------------------------------------------------------------------ */

    /// @notice Returns a full invoice record in one call.
    /// @param invoiceId The invoice to read.
    /// @dev Preferred over the auto-generated invoices() getter because callers decode a
    ///      named struct instead of a positional tuple that shifts whenever a field is added.
    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        _requireExists(invoiceId);
        return invoices[invoiceId];
    }

    /// @notice Returns a contiguous page of invoices, oldest first from the given offset.
    /// @param offset The first invoice id to read.
    /// @param limit The maximum number of invoices to return.
    /// @dev Lets a client load the whole book in a handful of calls instead of one per
    ///      invoice. Returns a short array when the offset plus limit runs past the end.
    function getInvoices(uint256 offset, uint256 limit) external view returns (Invoice[] memory page) {
        uint256 total = nextInvoiceId;
        if (offset >= total || limit == 0) return new Invoice[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new Invoice[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = invoices[i];
        }
    }

    /// @notice Returns every investor address recorded against an invoice.
    /// @param invoiceId The invoice to read.
    function getInvestors(uint256 invoiceId) external view returns (address[] memory) {
        return invoiceInvestors[invoiceId];
    }

    /// @notice Returns how many distinct investors have bought into an invoice.
    /// @param invoiceId The invoice to read.
    function investorCount(uint256 invoiceId) external view returns (uint256) {
        return invoiceInvestors[invoiceId].length;
    }

    /// @notice Returns an address's public identity and credit record in one call.
    /// @param user The address to read.
    /// @return username The claimed username, or an empty string if none was claimed.
    /// @return onTime Count of repayments made on or before the due date.
    /// @return late Count of late payments. Reserved, always zero in this version.
    /// @return defaults Count of invoices that passed their due date unpaid.
    /// @return trusted True once the Trusted thresholds have been met.
    function getCreditProfile(address user)
        external
        view
        returns (string memory username, uint256 onTime, uint256 late, uint256 defaults, bool trusted)
    {
        return (
            addressToUsername[user],
            onTimePayments[user],
            latePayments[user],
            defaultCount[user],
            isTrusted[user]
        );
    }

    /// @notice Amount an investor can currently withdraw from an invoice, zero if nothing.
    /// @param invoiceId The invoice to read.
    /// @param investor The investor to quote.
    /// @dev Never reverts, so a client can call it for any address and invoice to decide
    ///      whether to surface a claim action.
    function claimableInvestorShare(uint256 invoiceId, address investor) external view returns (uint256) {
        if (invoiceId >= nextInvoiceId) return 0;
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Repaid && inv.status != InvoiceStatus.Defaulted) return 0;
        if (inv.status == InvoiceStatus.Defaulted && !inv.stakeConsumed) return 0;
        if (investorContribution[invoiceId][investor] == 0) return 0;
        uint256 basis = inv.distributionBasisBps;
        if (basis == 0) return 0;
        return (inv.repaidAmount * investorPercentageBps[invoiceId][investor]) / basis;
    }

    /// @notice Amount the seller can currently withdraw from an invoice, zero if nothing.
    /// @param invoiceId The invoice to read.
    /// @dev Never reverts. A repaid invoice returns the unsold share plus any intact stake.
    ///      A defaulted invoice returns the stake only when no investor bought in.
    function claimableSellerShare(uint256 invoiceId) external view returns (uint256) {
        if (invoiceId >= nextInvoiceId) return 0;
        Invoice storage inv = invoices[invoiceId];
        if (inv.sellerHasClaimed) return 0;

        if (inv.status == InvoiceStatus.Defaulted) {
            if (inv.stakeConsumed || inv.stakedAmount == 0) return 0;
            return inv.stakedAmount;
        }
        if (inv.status != InvoiceStatus.Repaid) return 0;

        uint256 amount = (inv.repaidAmount * (10000 - inv.totalSoldPercentageBps)) / 10000;
        if (inv.stakedAmount > 0 && !inv.stakeConsumed) amount += inv.stakedAmount;
        return amount;
    }

    /// @notice True when this invoice has leftover truncation dust ready to be swept.
    /// @param invoiceId The invoice to read.
    function sweepableDust(uint256 invoiceId) external view returns (uint256) {
        if (invoiceId >= nextInvoiceId) return 0;
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Repaid && inv.status != InvoiceStatus.Defaulted) return 0;
        if (inv.claimsMade < _expectedClaims(inv, invoiceId)) return 0;
        return inv.poolAmount > inv.distributedAmount ? inv.poolAmount - inv.distributedAmount : 0;
    }

    /// @notice Face-value percentage, in basis points, that a given contribution would buy.
    /// @param invoiceId The tokenized invoice to quote against.
    /// @param amount The USDT amount the investor is considering contributing.
    /// @dev Mirrors the exact integer math used by invest, so a client preview cannot drift
    ///      from what the transaction will actually record.
    function quoteInvestment(uint256 invoiceId, uint256 amount) external view returns (uint256) {
        if (invoiceId >= nextInvoiceId) return 0;
        Invoice storage inv = invoices[invoiceId];
        if (inv.faceValue == 0 || inv.discountBps == 0) return 0;
        return (amount * 10000 * 10000) / (inv.faceValue * inv.discountBps);
    }
}
