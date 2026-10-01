// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../PaywellEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 that lets the test mint freely
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Minimal TokenMessengerV2 stub — just records the last call
contract MockMessenger {
    uint64 public lastNonce;
    uint256 public lastAmount;
    bytes32 public lastRecipient;

    function depositForBurn(
        uint256 amount,
        uint32,
        bytes32 mintRecipient,
        address,
        bytes32
    ) external returns (uint64 nonce) {
        lastAmount    = amount;
        lastRecipient = mintRecipient;
        nonce         = ++lastNonce;
    }
}

contract PaywellEscrowTest is Test {
    PaywellEscrow internal escrow;
    MockUSDC      internal usdc;
    MockMessenger internal messenger;

    address internal owner      = address(this);
    address internal buyer      = makeAddr("buyer");
    address internal merchant   = makeAddr("merchant");
    address internal feeRecip   = makeAddr("feeRecipient");

    uint256 constant AMOUNT = 100e6; // 100 USDC (6 dec)
    uint256 constant FEE    = AMOUNT / 100; // 1%

    function setUp() public {
        usdc      = new MockUSDC();
        messenger = new MockMessenger();
        escrow    = new PaywellEscrow(address(usdc), address(messenger), feeRecip);

        usdc.mint(buyer, 1000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    function _createOrder() internal returns (uint256 orderId) {
        vm.prank(buyer);
        orderId = escrow.createOrder(merchant, AMOUNT);
    }

    // ── createOrder ───────────────────────────────────────────────────────────

    function test_createOrder_recordsOrder() public {
        uint256 id = _createOrder();
        (
            address b, address m, uint256 amt, uint256 fee,
            , PaywellEscrow.OrderStatus status
        ) = escrow.orders(id);

        assertEq(b, buyer);
        assertEq(m, merchant);
        assertEq(amt, AMOUNT);
        assertEq(fee, FEE);
        assertEq(uint8(status), uint8(PaywellEscrow.OrderStatus.Created));
    }

    function test_createOrder_transfersUSDC() public {
        uint256 before = usdc.balanceOf(address(escrow));
        _createOrder();
        assertEq(usdc.balanceOf(address(escrow)), before + AMOUNT);
    }

    function test_createOrder_revertsZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert("amount is zero");
        escrow.createOrder(merchant, 0);
    }

    function test_createOrder_revertsZeroMerchant() public {
        vm.prank(buyer);
        vm.expectRevert("invalid merchant");
        escrow.createOrder(address(0), AMOUNT);
    }

    // ── confirmOrder ──────────────────────────────────────────────────────────

    function test_confirmOrder_releasesFunds() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.confirmOrder(id);

        assertEq(usdc.balanceOf(merchant),  AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecip),  FEE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_confirmOrder_statusConfirmed() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.confirmOrder(id);
        (,,,,, PaywellEscrow.OrderStatus status) = escrow.orders(id);
        assertEq(uint8(status), uint8(PaywellEscrow.OrderStatus.Confirmed));
    }

    function test_confirmOrder_revertsIfNotBuyer() public {
        uint256 id = _createOrder();
        vm.prank(merchant);
        vm.expectRevert("only buyer");
        escrow.confirmOrder(id);
    }

    function test_confirmOrder_revertsDoubleConfirm() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.confirmOrder(id);
        vm.prank(buyer);
        vm.expectRevert("order not active");
        escrow.confirmOrder(id);
    }

    // ── cancelOrder ───────────────────────────────────────────────────────────

    function test_cancelOrder_refundsBuyer() public {
        uint256 id = _createOrder();
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.cancelOrder(id);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_cancelOrder_revertsAfterWindow() public {
        uint256 id = _createOrder();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(buyer);
        vm.expectRevert("cancellation window has passed");
        escrow.cancelOrder(id);
    }

    function test_cancelOrder_revertsIfNotBuyer() public {
        uint256 id = _createOrder();
        vm.prank(merchant);
        vm.expectRevert("only buyer");
        escrow.cancelOrder(id);
    }

    // ── disputeOrder ──────────────────────────────────────────────────────────

    function test_disputeOrder_setsDisputedStatus() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.disputeOrder(id);
        (,,,,, PaywellEscrow.OrderStatus status) = escrow.orders(id);
        assertEq(uint8(status), uint8(PaywellEscrow.OrderStatus.Disputed));
    }

    function test_disputeOrder_revertsIfNotBuyer() public {
        uint256 id = _createOrder();
        vm.prank(merchant);
        vm.expectRevert("only buyer");
        escrow.disputeOrder(id);
    }

    // ── releaseAfterTimeout ───────────────────────────────────────────────────

    function test_releaseAfterTimeout_releasesFundsAfterDeadline() public {
        uint256 id = _createOrder();
        vm.warp(block.timestamp + 3 days + 1);
        escrow.releaseAfterTimeout(id);
        assertEq(usdc.balanceOf(merchant), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecip), FEE);
    }

    function test_releaseAfterTimeout_revertsBeforeDeadline() public {
        uint256 id = _createOrder();
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert("timeout not reached");
        escrow.releaseAfterTimeout(id);
    }

    // ── ownerRefundOrder ──────────────────────────────────────────────────────

    function test_ownerRefundOrder_refundsFromCreated() public {
        uint256 id = _createOrder();
        uint256 before = usdc.balanceOf(buyer);
        escrow.ownerRefundOrder(id);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_ownerRefundOrder_refundsFromDisputed() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.disputeOrder(id);
        uint256 before = usdc.balanceOf(buyer);
        escrow.ownerRefundOrder(id);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_ownerRefundOrder_revertsForNonOwner() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        vm.expectRevert();
        escrow.ownerRefundOrder(id);
    }

    // ── resolveDisputeToMerchant ──────────────────────────────────────────────

    function test_resolveDisputeToMerchant_paysMerchantAndFee() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.disputeOrder(id);
        escrow.resolveDisputeToMerchant(id);
        assertEq(usdc.balanceOf(merchant), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecip), FEE);
    }

    function test_resolveDisputeToMerchant_revertsIfNotDisputed() public {
        uint256 id = _createOrder();
        vm.expectRevert("order not disputed");
        escrow.resolveDisputeToMerchant(id);
    }

    // ── resolveDisputeToBuyer ─────────────────────────────────────────────────

    function test_resolveDisputeToBuyer_refundsBuyer() public {
        uint256 id = _createOrder();
        vm.prank(buyer);
        escrow.disputeOrder(id);
        uint256 before = usdc.balanceOf(buyer);
        escrow.resolveDisputeToBuyer(id);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    // ── cctpBurnAndTransfer ───────────────────────────────────────────────────

    function test_cctpBurnAndTransfer_callsMessenger() public {
        // Pre-fund the escrow contract with USDC as if it held escrowed funds
        usdc.mint(address(escrow), 50e6);
        bytes32 recipient = bytes32(uint256(uint160(merchant)));
        uint64 nonce = escrow.cctpBurnAndTransfer(50e6, 0, recipient, bytes32(0));
        assertEq(nonce, 1);
        assertEq(messenger.lastAmount(), 50e6);
        assertEq(messenger.lastRecipient(), recipient);
    }

    function test_cctpBurnAndTransfer_revertsForNonOwner() public {
        usdc.mint(address(escrow), 50e6);
        vm.prank(buyer);
        vm.expectRevert();
        escrow.cctpBurnAndTransfer(50e6, 0, bytes32(0), bytes32(0));
    }

    // ── setFeeRecipient ───────────────────────────────────────────────────────

    function test_setFeeRecipient_updatesAddress() public {
        address newRecip = makeAddr("newRecip");
        escrow.setFeeRecipient(newRecip);
        assertEq(escrow.feeRecipient(), newRecip);
    }

    function test_setFeeRecipient_revertsZeroAddress() public {
        vm.expectRevert("invalid fee recipient");
        escrow.setFeeRecipient(address(0));
    }

    // ── emergencyWithdraw ─────────────────────────────────────────────────────

    function test_emergencyWithdraw_movesTokens() public {
        usdc.mint(address(escrow), 10e6);
        address recv = makeAddr("recv");
        escrow.emergencyWithdraw(address(usdc), recv, 10e6);
        assertEq(usdc.balanceOf(recv), 10e6);
    }

    function test_emergencyWithdraw_revertsForNonOwner() public {
        usdc.mint(address(escrow), 10e6);
        vm.prank(buyer);
        vm.expectRevert();
        escrow.emergencyWithdraw(address(usdc), buyer, 10e6);
    }
}
