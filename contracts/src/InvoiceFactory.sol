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

        onTimePayments[msg.sender] += 1;
        _checkAndGrantTrusted(msg.sender);

        emit InvoicePaidDirect(invoiceId, msg.sender, net, fee, block.timestamp);
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

        onTimePayments[msg.sender] += 1;
        _checkAndGrantTrusted(msg.sender);

        emit InvoiceRepaid(invoiceId, msg.sender, inv.faceValue, fee, block.timestamp);
    }

    /// @notice An investor claims their proportional share of a repaid or staked-default invoice.
    /// @param invoiceId The invoice the caller invested in.
    function claimInvestorShare(uint256 invoiceId) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];

        if (inv.status == InvoiceStatus.Defaulted && inv.stakedAmount == 0) revert NoStakeToClaim();
        if (inv.status != InvoiceStatus.Repaid && inv.status != InvoiceStatus.Defaulted) revert InvalidStatus();

        uint256 contribution = investorContribution[invoiceId][msg.sender];
        if (contribution == 0) revert NotAuthorized();

        uint256 percentage = investorPercentageBps[invoiceId][msg.sender];
        uint256 share = (inv.repaidAmount * percentage) / 10000;
        if (share > 0) {
            IERC20(usdtToken).safeTransfer(msg.sender, share);
        }

        investorContribution[invoiceId][msg.sender] = 0;
        investorPercentageBps[invoiceId][msg.sender] = 0;
        inv.distributedAmount += share;
        inv.claimsMade += 1;

        emit InvestorClaimed(invoiceId, msg.sender, share, block.timestamp);
    }

    /// @notice The seller claims their share of a repaid invoice, plus stake return if applicable.
    /// @param invoiceId The id of the invoice being claimed.
    function claimSellerShare(uint256 invoiceId) external nonReentrant {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.seller != msg.sender) revert NotAuthorized();
        if (inv.status == InvoiceStatus.Defaulted) revert NoSellerShare();
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

        IERC20(usdtToken).safeTransfer(msg.sender, amountToSend);

        inv.sellerHasClaimed = true;
        inv.distributedAmount += amountToSend;
        inv.claimsMade += 1;

        emit SellerClaimed(invoiceId, msg.sender, sellerShare, block.timestamp);
        if (stakeReturned) {
            emit StakeReturned(invoiceId, msg.sender, inv.stakedAmount, block.timestamp);
        }
    }

    /// @notice Permissionless housekeeping that records a default once the due date has passed.
    /// @param invoiceId The overdue invoice to mark as defaulted.
    function markDefault(uint256 invoiceId) external {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvoiceStatus.Confirmed && inv.status != InvoiceStatus.Tokenized) revert InvalidStatus();
        if (block.timestamp <= inv.dueDate) revert NotYetDue();

        bool _wasTokenized = inv.status == InvoiceStatus.Tokenized;
        inv.status = InvoiceStatus.Defaulted;
        defaultCount[inv.buyer] += 1;

        if (_wasTokenized && inv.stakedAmount > 0) {
            inv.stakeConsumed = true;
            inv.repaidAmount = inv.stakedAmount;
        }

        emit InvoiceDefaulted(invoiceId, inv.buyer, block.timestamp);
    }

    /// @notice Permissionless distribution of genuine leftover dust to the fee recipient.
    /// @param invoiceId The id of the invoice whose leftovers are being swept.
    /// @dev Only callable once every rightful claimant has settled. The amount moved is the
    ///      difference between the amount made available for distribution and the sum of
    ///      all shares actually paid out, which is never more than a few USDT units. This
    ///      is not an admin sweep: it is fully permissionless and only ever moves dust.
    function sweepDust(uint256 invoiceId) external {
        _requireExists(invoiceId);
        Invoice storage inv = invoices[invoiceId];

        uint256 expectedClaims = (inv.status == InvoiceStatus.Defaulted)
            ? invoiceInvestors[invoiceId].length
            : invoiceInvestors[invoiceId].length + 1;
        if (inv.claimsMade < expectedClaims) revert AlreadyClaimed();

        uint256 leftover = inv.repaidAmount > inv.distributedAmount
            ? inv.repaidAmount - inv.distributedAmount
            : 0;
        if (leftover > 0) {
            IERC20(usdtToken).safeTransfer(platformFeeRecipient, leftover);
            inv.distributedAmount += leftover;
        }
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
    ///      mechanical result of onTimePayments and defaultCount meeting the thresholds.
    function _checkAndGrantTrusted(address user) internal {
        if (onTimePayments[user] >= TRUSTED_MIN_REPAID && defaultCount[user] <= TRUSTED_MAX_DEFAULTS) {
            emit TrustedStatusGranted(user, block.timestamp);
        }
    }
}