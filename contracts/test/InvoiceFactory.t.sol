// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console, Vm} from "forge-std/Test.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A simple 6-decimal USDT stand-in for testing.
contract MockUSDT is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract InvoiceFactoryTest is Test {
    InvoiceFactory internal factory;
    MockUSDT internal usdt;
    address internal feeRecipient = makeAddr("feeRecipient");

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal invA = makeAddr("investorA");
    address internal invB = makeAddr("investorB");
    address internal invC = makeAddr("investorC");

    uint256 internal constant FEE_BPS = 50;

    function setUp() public {
        usdt = new MockUSDT("Tether USD", "USDT", 6);
        factory = new InvoiceFactory(address(usdt), feeRecipient);

        usdt.mint(seller, 1_000_000e6);
        usdt.mint(buyer, 1_000_000e6);
        usdt.mint(invA, 1_000_000e6);
        usdt.mint(invB, 1_000_000e6);
        usdt.mint(invC, 1_000_000e6);

        _approve(seller);
        _approve(buyer);
        _approve(invA);
        _approve(invB);
        _approve(invC);
    }

    function _approve(address who) internal {
        vm.prank(who);
        usdt.approve(address(factory), type(uint256).max);
    }

    function _newInvoice(uint256 faceValue) internal returns (uint256 id) {
        vm.prank(seller);
        id = factory.createInvoice(buyer, faceValue, "Build services");
    }

    function _confirm(uint256 id, uint256 due) internal {
        vm.warp(block.timestamp + 100);
        vm.prank(buyer);
        factory.confirmInvoice(id, due);
    }

    function _fee(uint256 faceValue) internal pure returns (uint256) {
        return (faceValue * FEE_BPS) / 10000;
    }

    function _inv(uint256 id) internal view returns (InvoiceFactory.Invoice memory) {
        return factory.getInvoice(id);
    }

    function _status(uint256 id) internal view returns (InvoiceFactory.InvoiceStatus) {
        return factory.getInvoice(id).status;
    }

    function _tokenize(uint256 id, uint256 discountBps, uint256 stakeAmount) internal {
        vm.prank(seller);
        factory.tokenizeInvoice(id, discountBps, stakeAmount);
    }

    /* ================= Scenario 1: Direct payment happy path ================= */

    function test_DirectPaymentHappyPath() public {
        uint256 faceValue = 1000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);

        uint256 sellerBefore = usdt.balanceOf(seller);
        uint256 feeBefore = usdt.balanceOf(feeRecipient);
        uint256 buyerBefore = usdt.balanceOf(buyer);

        vm.prank(buyer);
        factory.payDirect(id);

        assertEq(usdt.balanceOf(buyer), buyerBefore - faceValue, "buyer pays face value");
        assertEq(usdt.balanceOf(feeRecipient), feeBefore + _fee(faceValue), "fee recipient paid");
        assertEq(usdt.balanceOf(address(factory)), faceValue - _fee(faceValue), "factory holds net");

        vm.prank(seller);
        factory.claimSellerShare(id);

        assertEq(usdt.balanceOf(seller), sellerBefore + (faceValue - _fee(faceValue)), "seller gets net");
        assertEq(usdt.balanceOf(address(factory)), 0, "nothing left");

        assertEq(uint256(_status(id)), uint256(InvoiceFactory.InvoiceStatus.Repaid));
        assertEq(_inv(id).repaidAmount, faceValue - _fee(faceValue));
    }

    /* ================= Scenario 2: Full subscription + full repayment ================= */

    function test_TokenizedFullSubscriptionFullRepayment() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);

        uint256 discountBps = 8500;
        _tokenize(id, discountBps, 0);

        uint256 fullCost = (faceValue * discountBps) / 10000; // 85%
        uint256 sellerAfterInvest = usdt.balanceOf(seller);

        vm.prank(invA);
        factory.invest(id, fullCost);

        // investor paid 85% of face, seller received it up front
        assertEq(usdt.balanceOf(seller), sellerAfterInvest + fullCost, "seller got discounted proceeds");
        assertEq(_inv(id).totalSoldPercentageBps, 10000, "fully sold");

        uint256 net = faceValue - _fee(faceValue);
        uint256 invABefore = usdt.balanceOf(invA);

        vm.prank(buyer);
        factory.repayTokenized(id);

        // investor claims full net share
        vm.prank(invA);
        factory.claimInvestorShare(id);
        assertEq(usdt.balanceOf(invA), invABefore + net, "investor receives net");

        // seller has nothing to receive (fully sold, no stake), claim succeeds with zero
        uint256 sellerBefore = usdt.balanceOf(seller);
        vm.prank(seller);
        factory.claimSellerShare(id);
        assertEq(usdt.balanceOf(seller), sellerBefore, "seller receives zero when fully sold");

        // all distributed
        assertEq(usdt.balanceOf(address(factory)), 0);
    }

    /* ================= Partial subscription, correct split ================= */

    function test_PartialSubscriptionSplit() public {
        uint256 faceValue = 100_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);

        uint256 discountBps = 9000; // 90%
        _tokenize(id, discountBps, 0);

        // Buy 60% of the invoice. Contribution = 60% of face * 90% discount
        uint256 investCost = (faceValue * 6000 / 10000 * 9000) / 10000;
        vm.prank(invA);
        factory.invest(id, investCost);

        assertEq(_inv(id).totalSoldPercentageBps, 6000, "60% sold");

        uint256 sellerPre = usdt.balanceOf(seller);
        uint256 net = faceValue - _fee(faceValue);

        vm.prank(buyer);
        factory.repayTokenized(id);

        // investor gets 60% of net
        uint256 invABefore = usdt.balanceOf(invA);
        vm.prank(invA);
        factory.claimInvestorShare(id);
        assertEq(usdt.balanceOf(invA), invABefore + (net * 6000 / 10000), "investor 60%");

        // seller gets remaining 40%
        vm.prank(seller);
        factory.claimSellerShare(id);
        assertEq(usdt.balanceOf(seller), sellerPre + (net * 4000 / 10000), "seller 40%");

        assertEq(usdt.balanceOf(address(factory)), 0, "fully distributed");
    }

    /* ================= Seller stake, returned on success ================= */

    function test_StakeReturnedOnSuccess() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);

        uint256 stake = 2000e6;
        uint256 sellerBefore = usdt.balanceOf(seller);
        _tokenize(id, 8500, stake);
        assertEq(usdt.balanceOf(seller), sellerBefore - stake, "stake locked");

        // investor buys 50%
        uint256 cost = (faceValue * 5000 / 10000 * 8500) / 10000;
        vm.prank(invA);
        factory.invest(id, cost);

        uint256 sellerAfterInvest = usdt.balanceOf(seller);

        vm.prank(buyer);
        factory.repayTokenized(id);

        uint256 net = faceValue - _fee(faceValue);
        // investor 50%
        vm.prank(invA);
        factory.claimInvestorShare(id);

        // seller: 50% share of net + full stake back
        vm.prank(seller);
        factory.claimSellerShare(id);
        uint256 expected = (net * 5000 / 10000) + stake;
        assertEq(usdt.balanceOf(seller), sellerAfterInvest + expected, "seller share + stake returned");
        assertEq(usdt.balanceOf(address(factory)), 0);
    }

    /* ================= Default without stake: nothing recoverable ================= */

    function test_DefaultNoStakeInvestorNothing() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        _tokenize(id, 8500, 0);

        uint256 cost = (faceValue * 10000 / 10000 * 8500) / 10000;
        vm.prank(invA);
        factory.invest(id, cost);

        // buyer never pays; deadline passes
        vm.warp(block.timestamp + 31 days);
        factory.markDefault(id);

        assertEq(uint256(_status(id)), uint256(InvoiceFactory.InvoiceStatus.Defaulted));
        assertEq(factory.defaultCount(buyer), 1);
        assertEq(_inv(id).repaidAmount, 0, "nothing available");

        vm.prank(invA);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.NoStakeToClaim.selector));
        factory.claimInvestorShare(id);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.NoSellerShare.selector));
        factory.claimSellerShare(id);
    }

    /* ================= Default with stake: stake available to investors ================= */

    function test_DefaultWithStakePaysInvestors() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        uint256 stake = 3000e6;
        _tokenize(id, 8500, stake);

        // two investors fully subscribe
        uint256 cost = (faceValue * 5000 / 10000 * 8500) / 10000;
        vm.prank(invA);
        factory.invest(id, cost);
        vm.prank(invB);
        factory.invest(id, cost);

        vm.warp(block.timestamp + 31 days);
        factory.markDefault(id);

        assertEq(_inv(id).repaidAmount, stake, "stake becomes the claimable pool");
        assertEq(_inv(id).stakeConsumed, true);

        // investors split the stake proportionally
        uint256 invABefore = usdt.balanceOf(invA);
        uint256 invBBefore = usdt.balanceOf(invB);
        vm.prank(invA);
        factory.claimInvestorShare(id);
        vm.prank(invB);
        factory.claimInvestorShare(id);
        assertEq(usdt.balanceOf(invA), invABefore + stake / 2, "investor A half of stake");
        assertEq(usdt.balanceOf(invB), invBBefore + stake / 2, "investor B half of stake");

        // seller cannot claim after default
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.NoSellerShare.selector));
        factory.claimSellerShare(id);

        // dust swept (stake exactly divisible -> 0 here)
        vm.prank(seller);
        factory.sweepDust(id);
        assertEq(usdt.balanceOf(address(factory)), 0, "nothing stuck");
    }

    /* ================= Time-based reverts ================= */

    function test_PayAfterDueDateReverts() public {
        uint256 faceValue = 1000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 10 days);

        vm.warp(block.timestamp + 11 days);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.PastDueDate.selector));
        factory.payDirect(id);
    }

    function test_InvestAfterDueDateReverts() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 10 days);
        _tokenize(id, 8500, 0);

        vm.warp(block.timestamp + 11 days);
        vm.prank(invA);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.PastDueDate.selector));
        factory.invest(id, 1000e6);
    }

    function test_TokenizeUnconfirmedReverts() public {
        uint256 id = _newInvoice(10_000e6); // not confirmed
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidStatus.selector));
        factory.tokenizeInvoice(id, 8500, 0);
    }

    function test_InvalidDiscountRateReverts() public {
        uint256 id = _newInvoice(10_000e6);
        _confirm(id, block.timestamp + 10 days);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidDiscountRate.selector, 4000));
        factory.tokenizeInvoice(id, 4000, 0);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidDiscountRate.selector, 10000));
        factory.tokenizeInvoice(id, 10000, 0);
    }

    /* ================= Double claiming ================= */

    function test_DoubleClaimReverts() public {
        uint256 faceValue = 1000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);

        vm.prank(buyer);
        factory.payDirect(id);

        vm.prank(seller);
        factory.claimSellerShare(id);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.AlreadyClaimed.selector));
        factory.claimSellerShare(id);
    }

    /* ================= Username ================= */

    function test_UsernameClaim() public {
        vm.prank(seller);
        factory.claimUsername("alice");

        assertEq(factory.addressToUsername(seller), "alice");
        assertEq(factory.usernameToAddress("alice"), seller);

        // uniqueness
        vm.prank(invA);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UsernameTaken.selector));
        factory.claimUsername("alice");

        // second claim by same address
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UsernameAlreadySet.selector));
        factory.claimUsername("newName");

        // invalid length
        vm.prank(invA);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidUsername.selector));
        factory.claimUsername("");
    }

    function test_UsernameFeeCharged() public {
        uint256 feeBefore = usdt.balanceOf(feeRecipient);
        vm.prank(invA);
        factory.claimUsername("aliceInvo");
        assertEq(usdt.balanceOf(feeRecipient), feeBefore + 1e6, "1 USDT fee");
    }

    /* ================= Trusted badge ================= */

    function test_TrustedTriggersAfterThreshold() public {
        // Create and confirm 5 invoices with the same future due date.
        uint256 due = block.timestamp + 30 days;
        for (uint256 i = 0; i < 5; i++) {
            uint256 id = _newInvoice(100e6);
            vm.prank(buyer);
            factory.confirmInvoice(id, due);
        }
        // Pay all five before the due date.
        vm.warp(due - 100);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(buyer);
            factory.payDirect(i);
        }
        assertEq(factory.onTimePayments(buyer), 5);
        assertEq(factory.defaultCount(buyer), 0);
    }

    function test_TrustedNotGrantedBeforeThreshold() public {
        uint256 due = block.timestamp + 30 days;
        for (uint256 i = 0; i < 4; i++) {
            uint256 id = _newInvoice(100e6);
            vm.prank(buyer);
            factory.confirmInvoice(id, due);
        }
        vm.warp(due - 100);
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(buyer);
            factory.payDirect(i);
        }
        assertEq(factory.onTimePayments(buyer), 4);
    }

    /* ================= Rounding / dust across three investors ================= */

    function test_UnevenSplitDustHandling() public {
        // Awkward face value forces truncation in the proportional divisions.
        uint256 faceValue = 100_003e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        _tokenize(id, 7000, 0);

        // three investors buy 33%, 33%, 33% (99%) at 70% discount
        uint256 costEach = (faceValue * 3300 / 10000 * 7000) / 10000;
        vm.prank(invA); factory.invest(id, costEach);
        vm.prank(invB); factory.invest(id, costEach);
        vm.prank(invC); factory.invest(id, costEach);

        vm.prank(buyer);
        factory.repayTokenized(id);

        vm.prank(invA); factory.claimInvestorShare(id);
        vm.prank(invB); factory.claimInvestorShare(id);
        vm.prank(invC); factory.claimInvestorShare(id);
        vm.prank(seller); factory.claimSellerShare(id);

        uint256 feeBefore = usdt.balanceOf(feeRecipient);

        // Permissionless sweep moves any leftover dust to the fee recipient.
        factory.sweepDust(id);

        // No funds are permanently stuck in the contract.
        assertEq(usdt.balanceOf(address(factory)), 0, "contract fully empty");

        // Fee recipient never loses funds through sweeping.
        assertGe(usdt.balanceOf(feeRecipient), feeBefore, "fee recipient non-decreasing");
    }

    /* ================= Misc validation ================= */

    function test_CreateInvoiceValidation() public {
        // zero buyer
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.ZeroAddress.selector));
        factory.createInvoice(address(0), 1000e6, "x");

        // seller == buyer
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidBuyer.selector));
        factory.createInvoice(seller, 1000e6, "x");

        // zero face value
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.ZeroAmount.selector));
        factory.createInvoice(buyer, 0, "x");
    }

    function test_ConfirmRequiresFutureDueDate() public {
        uint256 id = _newInvoice(1000e6);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.NotYetDue.selector));
        factory.confirmInvoice(id, block.timestamp);
    }

    function test_MarkDefaultOnlyAfterDue() public {
        uint256 id = _newInvoice(1000e6);
        _confirm(id, block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.NotYetDue.selector));
        factory.markDefault(id);

        vm.warp(block.timestamp + 31 days);
        factory.markDefault(id);
        assertEq(uint256(_status(id)), uint256(InvoiceFactory.InvoiceStatus.Defaulted));
    }

    function test_OverInvestReverts() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        _tokenize(id, 8500, 0);

        uint256 fullCost = (faceValue * 8500) / 10000;
        vm.prank(invA); factory.invest(id, fullCost);
        vm.prank(invB);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.ExceedsAvailablePercentage.selector, 1, 0));
        factory.invest(id, 1e6);
    }

    /* ================= Partially sold default: investors get the whole stake ================= */

    function test_PartialSaleDefaultGivesInvestorsEntireStake() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        uint256 stake = 3000e6;
        _tokenize(id, 8500, stake);

        // Only 40 percent of the invoice is sold, split 30/10 between two investors.
        uint256 costA = (faceValue * 3000 / 10000 * 8500) / 10000;
        uint256 costB = (faceValue * 1000 / 10000 * 8500) / 10000;
        vm.prank(invA); factory.invest(id, costA);
        vm.prank(invB); factory.invest(id, costB);
        assertEq(_inv(id).totalSoldPercentageBps, 4000, "40% sold");

        vm.warp(block.timestamp + 31 days);
        factory.markDefault(id);

        InvoiceFactory.Invoice memory rec = _inv(id);
        assertEq(rec.stakeConsumed, true, "stake consumed");
        assertEq(rec.distributionBasisBps, 4000, "basis is the sold percentage, not 10000");

        uint256 aBefore = usdt.balanceOf(invA);
        uint256 bBefore = usdt.balanceOf(invB);
        vm.prank(invA); factory.claimInvestorShare(id);
        vm.prank(invB); factory.claimInvestorShare(id);

        // The whole stake is shared between the investors 3:1, not scaled down to 40 percent.
        assertEq(usdt.balanceOf(invA) - aBefore, stake * 3000 / 4000, "investor A gets 3/4 of the stake");
        assertEq(usdt.balanceOf(invB) - bBefore, stake * 1000 / 4000, "investor B gets 1/4 of the stake");
        assertEq(
            (usdt.balanceOf(invA) - aBefore) + (usdt.balanceOf(invB) - bBefore),
            stake,
            "entire stake reaches investors"
        );

        // The seller gets nothing back: the stake was fully spent protecting investors.
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.NoSellerShare.selector));
        factory.claimSellerShare(id);

        factory.sweepDust(id);
        assertEq(usdt.balanceOf(address(factory)), 0, "nothing left for the platform to sweep");
    }

    /* ================= Default with a stake but no investors: stake returns ================= */

    function test_DefaultWithStakeNoInvestorsReturnsStakeToSeller() public {
        uint256 id = _newInvoice(10_000e6);
        _confirm(id, block.timestamp + 30 days);
        uint256 stake = 2500e6;
        uint256 sellerBefore = usdt.balanceOf(seller);
        _tokenize(id, 8500, stake);
        assertEq(usdt.balanceOf(seller), sellerBefore - stake, "stake locked");

        // Nobody invests, then the buyer defaults.
        vm.warp(block.timestamp + 31 days);
        factory.markDefault(id);

        // With no investors to protect, the stake was never consumed.
        InvoiceFactory.Invoice memory rec = _inv(id);
        assertEq(rec.stakeConsumed, false, "stake not consumed when nobody invested");
        assertEq(factory.claimableSellerShare(id), stake, "stake is quoted as claimable");

        vm.prank(seller);
        factory.claimSellerShare(id);
        assertEq(usdt.balanceOf(seller), sellerBefore, "seller made whole on their own stake");

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.AlreadyClaimed.selector));
        factory.claimSellerShare(id);

        factory.sweepDust(id);
        assertEq(usdt.balanceOf(address(factory)), 0, "nothing stuck");
    }

    /* ================= Trusted badge is granted exactly once ================= */

    function test_TrustedGrantedOnceAndFlagSet() public {
        uint256 due = block.timestamp + 30 days;
        for (uint256 i = 0; i < 6; i++) {
            uint256 id = _newInvoice(100e6);
            vm.prank(buyer);
            factory.confirmInvoice(id, due);
        }
        vm.warp(due - 100);

        assertEq(factory.isTrusted(buyer), false, "not trusted before the threshold");

        // The fifth on-time payment crosses the threshold and must emit exactly once.
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(buyer);
            factory.payDirect(i);
        }
        assertEq(factory.isTrusted(buyer), false, "four payments is not enough");

        vm.expectEmit(true, false, false, false, address(factory));
        emit InvoiceFactory.TrustedStatusGranted(buyer, block.timestamp);
        vm.prank(buyer);
        factory.payDirect(4);
        assertEq(factory.isTrusted(buyer), true, "granted on the fifth payment");

        // A sixth payment must not re-emit the grant.
        vm.recordLogs();
        vm.prank(buyer);
        factory.payDirect(5);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 grantTopic = keccak256("TrustedStatusGranted(address,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != grantTopic, "grant must not be emitted twice");
        }
    }

    /* ================= sweepDust guards ================= */

    function test_SweepDustRevertsWhileClaimsOutstanding() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        _tokenize(id, 9000, 0);

        uint256 cost = (faceValue * 5000 / 10000 * 9000) / 10000;
        vm.prank(invA); factory.invest(id, cost);

        vm.prank(buyer);
        factory.repayTokenized(id);

        // One investor plus the seller are expected to claim, neither has yet.
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.ClaimsPending.selector, 0, 2));
        factory.sweepDust(id);

        vm.prank(invA); factory.claimInvestorShare(id);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.ClaimsPending.selector, 1, 2));
        factory.sweepDust(id);

        vm.prank(seller); factory.claimSellerShare(id);
        factory.sweepDust(id);
        assertEq(usdt.balanceOf(address(factory)), 0, "settled and empty");
    }

    function test_SweepDustRejectsUnsettledInvoice() public {
        uint256 id = _newInvoice(1000e6);
        _confirm(id, block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidStatus.selector));
        factory.sweepDust(id);
    }

    /* ================= Repaid invoice with a stake leaves nothing behind ================= */

    function test_RepaidWithStakeFullyDrains() public {
        uint256 faceValue = 100_003e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        uint256 stake = 7777e6;
        _tokenize(id, 7300, stake);

        uint256 costEach = (faceValue * 3300 / 10000 * 7300) / 10000;
        vm.prank(invA); factory.invest(id, costEach);
        vm.prank(invB); factory.invest(id, costEach);
        vm.prank(invC); factory.invest(id, costEach);

        vm.prank(buyer);
        factory.repayTokenized(id);

        vm.prank(invA); factory.claimInvestorShare(id);
        vm.prank(invB); factory.claimInvestorShare(id);
        vm.prank(invC); factory.claimInvestorShare(id);
        vm.prank(seller); factory.claimSellerShare(id);

        // The pool covered the net repayment and the returned stake, so the only remainder
        // is truncation dust and the contract ends completely empty.
        assertLe(factory.sweepableDust(id), 4, "dust is at most one unit per claim");
        factory.sweepDust(id);
        assertEq(usdt.balanceOf(address(factory)), 0, "contract fully empty");
    }

    /* ================= View helpers ================= */

    function test_ViewHelpers() public {
        uint256 faceValue = 10_000e6;
        uint256 id = _newInvoice(faceValue);
        _confirm(id, block.timestamp + 30 days);
        _tokenize(id, 8000, 500e6);

        // quoteInvestment mirrors the math that invest actually applies.
        uint256 amount = 1600e6; // 20% of face at an 80% discount
        uint256 quoted = factory.quoteInvestment(id, amount);
        assertEq(quoted, 2000, "quote is 20% of face value");

        vm.prank(invA);
        factory.invest(id, amount);
        assertEq(factory.investorPercentageBps(id, invA), quoted, "recorded percentage matches the quote");

        assertEq(factory.investorCount(id), 1, "one investor");
        address[] memory investors = factory.getInvestors(id);
        assertEq(investors.length, 1);
        assertEq(investors[0], invA);

        // Paging returns the whole book and clamps past the end.
        _newInvoice(500e6);
        assertEq(factory.getInvoices(0, 10).length, 2, "page clamps to the book size");
        assertEq(factory.getInvoices(1, 10).length, 1, "offset respected");
        assertEq(factory.getInvoices(5, 10).length, 0, "offset past the end is empty");

        // Claimables are zero before settlement and never revert.
        assertEq(factory.claimableInvestorShare(id, invA), 0, "nothing claimable yet");
        assertEq(factory.claimableSellerShare(id), 0, "nothing claimable yet");
        assertEq(factory.claimableInvestorShare(999, invA), 0, "unknown invoice returns zero");

        vm.prank(buyer);
        factory.repayTokenized(id);

        uint256 net = faceValue - _fee(faceValue);
        assertEq(factory.claimableInvestorShare(id, invA), net * 2000 / 10000, "investor quoted 20%");
        assertEq(factory.claimableSellerShare(id), (net * 8000 / 10000) + 500e6, "seller quoted 80% plus stake");

        // getCreditProfile aggregates identity and history in one call.
        vm.prank(buyer);
        factory.claimUsername("buyer-one");
        (string memory name, uint256 onTime, uint256 late, uint256 defaults, bool trusted) =
            factory.getCreditProfile(buyer);
        assertEq(name, "buyer-one");
        assertEq(onTime, 1);
        assertEq(late, 0);
        assertEq(defaults, 0);
        assertEq(trusted, false);
    }

    function test_GetInvoiceRejectsUnknownId() public {
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidInvoice.selector));
        factory.getInvoice(0);
    }
}
