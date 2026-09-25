// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller
    ) external returns (uint64 nonce);
}

contract PaywellEscrow is Ownable, ReentrancyGuard {
    enum OrderStatus {
        None,
        Created,
        Confirmed,
        Disputed,
        Refunded
    }

    struct Order {
        address buyer;
        address merchant;
        uint256 amount;
        uint256 fee;
        uint256 createdAt;
        OrderStatus status;
    }

    uint256 public constant FEE_BPS = 100; // 1%
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DISPUTE_TIMEOUT = 3 days;
    uint256 public constant CANCEL_WINDOW = 1 hours;

    IERC20 public immutable usdc;
    ITokenMessengerV2 public tokenMessenger;
    address public feeRecipient;

    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed merchant,
        uint256 amount,
        uint256 fee,
        uint256 createdAt
    );
    event OrderConfirmed(
        uint256 indexed orderId,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 feeAmount,
        bool byTimeout
    );
    event OrderDisputed(uint256 indexed orderId, address indexed buyer);
    event OrderRefunded(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event FeeCollected(uint256 indexed orderId, address indexed feeRecipient, uint256 feeAmount);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event TokenMessengerUpdated(address indexed oldMessenger, address indexed newMessenger);

    constructor(address _usdc, address _tokenMessenger, address _feeRecipient) Ownable(msg.sender) {
        require(_usdc != address(0), "invalid usdc");
        require(_tokenMessenger != address(0), "invalid messenger");
        require(_feeRecipient != address(0), "invalid fee recipient");

        usdc = IERC20(_usdc);
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        feeRecipient = _feeRecipient;
    }

    function createOrder(address merchant, uint256 amount) external nonReentrant returns (uint256 orderId) {
        require(merchant != address(0), "invalid merchant");
        require(amount > 0, "amount is zero");

        orderId = nextOrderId++;
        uint256 fee = _calculateFee(amount);

        orders[orderId] = Order({
            buyer: msg.sender,
            merchant: merchant,
            amount: amount,
            fee: fee,
            createdAt: block.timestamp,
            status: OrderStatus.Created
        });

        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");

        emit OrderCreated(orderId, msg.sender, merchant, amount, fee, block.timestamp);
    }

    function confirmOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Created, "order not active");
        require(msg.sender == order.buyer, "only buyer");

        _releaseToMerchant(orderId, order, false);
    }

    function disputeOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Created, "order not active");
        require(msg.sender == order.buyer, "only buyer");

        order.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    function releaseAfterTimeout(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Created, "order not releasable");
        require(block.timestamp >= order.createdAt + DISPUTE_TIMEOUT, "timeout not reached");

        _releaseToMerchant(orderId, order, true);
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Created, "order not cancellable");
        require(msg.sender == order.buyer, "only buyer");
        require(block.timestamp < order.createdAt + CANCEL_WINDOW, "cancellation window has passed");

        order.status = OrderStatus.Refunded;
        require(usdc.transfer(order.buyer, order.amount), "refund transfer failed");

        emit OrderRefunded(orderId, order.buyer, order.amount);
    }

    function ownerRefundOrder(uint256 orderId) external onlyOwner nonReentrant {
        Order storage order = orders[orderId];
        require(
            order.status == OrderStatus.Created || order.status == OrderStatus.Disputed,
            "order not refundable"
        );

        order.status = OrderStatus.Refunded;
        require(usdc.transfer(order.buyer, order.amount), "refund transfer failed");

        emit OrderRefunded(orderId, order.buyer, order.amount);
    }

    function resolveDisputeToMerchant(uint256 orderId) external onlyOwner nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Disputed, "order not disputed");

        uint256 fee = order.fee;
        uint256 merchantAmount = order.amount - fee;

        order.status = OrderStatus.Confirmed;

        require(usdc.transfer(order.merchant, merchantAmount), "merchant transfer failed");
        require(usdc.transfer(feeRecipient, fee), "fee transfer failed");

        emit FeeCollected(orderId, feeRecipient, fee);
        emit OrderConfirmed(orderId, order.merchant, merchantAmount, fee, false);
    }

    function resolveDisputeToBuyer(uint256 orderId) external onlyOwner nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Disputed, "order not disputed");

        order.status = OrderStatus.Refunded;
        require(usdc.transfer(order.buyer, order.amount), "refund transfer failed");

        emit OrderRefunded(orderId, order.buyer, order.amount);
    }

    function cctpBurnAndTransfer(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        bytes32 destinationCaller
    ) external onlyOwner nonReentrant returns (uint64 nonce) {
        require(amount > 0, "amount is zero");

        require(usdc.approve(address(tokenMessenger), 0), "approve reset failed");
        require(usdc.approve(address(tokenMessenger), amount), "approve failed");

        nonce = tokenMessenger.depositForBurn(
            amount,
            destinationDomain,
            mintRecipient,
            address(usdc),
            destinationCaller
        );

        require(usdc.approve(address(tokenMessenger), 0), "approve cleanup failed");
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "invalid fee recipient");

        address oldFeeRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(oldFeeRecipient, newFeeRecipient);
    }

    function setTokenMessenger(address newTokenMessenger) external onlyOwner {
        require(newTokenMessenger != address(0), "invalid messenger");

        address oldTokenMessenger = address(tokenMessenger);
        tokenMessenger = ITokenMessengerV2(newTokenMessenger);

        emit TokenMessengerUpdated(oldTokenMessenger, newTokenMessenger);
    }

    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "invalid token");
        require(to != address(0), "invalid recipient");
        require(amount > 0, "amount is zero");

        require(IERC20(token).transfer(to, amount), "withdraw failed");
    }

    function _releaseToMerchant(uint256 orderId, Order storage order, bool byTimeout) internal {
        uint256 fee = order.fee;
        uint256 merchantAmount = order.amount - fee;

        order.status = OrderStatus.Confirmed;

        require(usdc.transfer(order.merchant, merchantAmount), "merchant transfer failed");
        require(usdc.transfer(feeRecipient, fee), "fee transfer failed");

        emit FeeCollected(orderId, feeRecipient, fee);
        emit OrderConfirmed(orderId, order.merchant, merchantAmount, fee, byTimeout);
    }

    function _calculateFee(uint256 amount) internal pure returns (uint256) {
        return (amount * FEE_BPS) / BPS_DENOMINATOR;
    }
}
