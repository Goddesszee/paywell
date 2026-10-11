// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NANNameRegistry is Ownable, ReentrancyGuard {
    uint256 private constant _ONE_YEAR = 365 days;

    uint256 public constant COMMIT_DELAY = 2;
    uint256 public constant COMMIT_EXPIRY = 256;
    uint256 public constant MAX_NAMES_PER_ADDRESS = 20;

    IERC20 private immutable _usdc;

    uint256 private _price1Yr = 2_000_000;
    uint256 private _price2Yr = 3_000_000;
    uint256 private _price5Yr = 8_000_000;

    struct NameRecord {
        address owner;
        uint256 expiry;
    }

    mapping(string => NameRecord) private _records;
    mapping(address => string[]) private _ownedNames;
    mapping(address => mapping(bytes32 => bool)) private _ownsNameHash;
    mapping(address => string) private _primaryNames;
    mapping(bytes32 => uint256) private _commitments;

    event NameRegistered(string name, address indexed owner, uint256 expiry, uint256 pricePaid);
    event NameRenewed(string name, address indexed owner, uint256 newExpiry);
    event NameCommitted(bytes32 indexed commitment, address indexed committer, uint256 blockNumber);
    event PrimaryNameUpdated(address indexed owner, string name);
    event PricesUpdated(uint256 price1Yr, uint256 price2Yr, uint256 price5Yr);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address usdc_) Ownable(msg.sender) {
        require(usdc_ != address(0), "USDC is zero");
        _usdc = IERC20(usdc_);
    }

    function commit(bytes32 commitment) external {
        _commitments[commitment] = block.number;
        emit NameCommitted(commitment, msg.sender, block.number);
    }

    function register(string calldata name, uint8 duration, bytes32 salt) external nonReentrant {
        bytes32 commitment = keccak256(abi.encodePacked(name, salt, msg.sender));
        uint256 commitBlock = _commitments[commitment];
        require(commitBlock != 0, "No commitment found");
        require(block.number >= commitBlock + COMMIT_DELAY, "Too soon after commit");
        require(block.number <= commitBlock + COMMIT_EXPIRY, "Commitment expired");
        delete _commitments[commitment];

        _validateName(name);

        NameRecord storage record = _records[name];
        require(record.owner == address(0) || block.timestamp > record.expiry, "Name already taken");

        (uint256 price, uint256 period) = _priceAndPeriod(duration);
        require(_usdc.transferFrom(msg.sender, address(this), price), "Payment failed");

        address previousOwner = record.owner;
        if (previousOwner != address(0) && previousOwner != msg.sender) {
            _removeFromOwner(previousOwner, name);

            if (_equals(_primaryNames[previousOwner], name)) {
                delete _primaryNames[previousOwner];
            }
        }

        record.owner = msg.sender;
        record.expiry = block.timestamp + period;

        _addToOwner(msg.sender, name);

        if (bytes(_primaryNames[msg.sender]).length == 0) {
            _primaryNames[msg.sender] = name;
            emit PrimaryNameUpdated(msg.sender, name);
        }

        emit NameRegistered(name, msg.sender, record.expiry, price);
    }

    function renew(string calldata name, uint8 duration) external nonReentrant {
        NameRecord storage record = _records[name];
        require(record.owner == msg.sender, "Not your name");

        (uint256 price, uint256 period) = _priceAndPeriod(duration);
        require(_usdc.transferFrom(msg.sender, address(this), price), "Payment failed");

        uint256 base = record.expiry > block.timestamp ? record.expiry : block.timestamp;
        record.expiry = base + period;

        emit NameRenewed(name, msg.sender, record.expiry);
    }

    function setPrimaryName(string calldata name) external {
        NameRecord storage record = _records[name];
        require(record.owner == msg.sender, "Not your name");
        require(block.timestamp <= record.expiry, "Name expired");

        _primaryNames[msg.sender] = name;

        emit PrimaryNameUpdated(msg.sender, name);
    }

    function resolve(string calldata name) external view returns (address) {
        NameRecord storage record = _records[name];
        if (record.owner == address(0) || block.timestamp > record.expiry) {
            return address(0);
        }
        return record.owner;
    }

    function primaryName(address addr) external view returns (string memory) {
        string memory currentPrimary = _primaryNames[addr];
        if (bytes(currentPrimary).length == 0) {
            return "";
        }

        NameRecord storage record = _records[currentPrimary];
        if (record.owner != addr || block.timestamp > record.expiry) {
            return "";
        }

        return currentPrimary;
    }

    function isAvailable(string calldata name) external view returns (bool) {
        NameRecord storage record = _records[name];
        return record.owner == address(0) || block.timestamp > record.expiry;
    }

    function getNamesForAddress(address addr) external view returns (string[] memory) {
        string[] storage all = _ownedNames[addr];
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            NameRecord storage r = _records[all[i]];
            if (r.owner == addr && block.timestamp <= r.expiry) {
                count++;
            }
        }

        string[] memory active = new string[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            NameRecord storage r = _records[all[i]];
            if (r.owner == addr && block.timestamp <= r.expiry) {
                active[idx++] = all[i];
            }
        }

        return active;
    }

    function price1Yr() external view returns (uint256) {
        return _price1Yr;
    }

    function price2Yr() external view returns (uint256) {
        return _price2Yr;
    }

    function price5Yr() external view returns (uint256) {
        return _price5Yr;
    }

    function updatePrices(uint256 p1, uint256 p2, uint256 p5) external onlyOwner {
        _price1Yr = p1;
        _price2Yr = p2;
        _price5Yr = p5;

        emit PricesUpdated(p1, p2, p5);
    }

    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "To is zero");
        require(_usdc.transfer(to, amount), "Transfer failed");

        emit Withdrawn(to, amount);
    }

    function _priceAndPeriod(uint8 duration) private view returns (uint256 price, uint256 period) {
        if (duration == 1) {
            return (_price1Yr, _ONE_YEAR);
        }
        if (duration == 2) {
            return (_price2Yr, _ONE_YEAR * 2);
        }
        if (duration == 5) {
            return (_price5Yr, _ONE_YEAR * 5);
        }
        revert("Choose 1, 2, or 5");
    }

    function _validateName(string calldata name) private pure {
        bytes memory b = bytes(name);
        require(b.length >= 2, "Name too short");
        require(b.length <= 32, "Name too long");

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool valid = (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39) || (c == 0x2D);
            require(valid, "Invalid name");
        }
    }

    function _addToOwner(address addr, string calldata name) private {
        bytes32 hash = keccak256(bytes(name));
        if (_ownsNameHash[addr][hash]) {
            return;
        }

        require(_ownedNames[addr].length < MAX_NAMES_PER_ADDRESS, "Too many names");

        _ownsNameHash[addr][hash] = true;
        _ownedNames[addr].push(name);
    }

    function _removeFromOwner(address addr, string calldata name) private {
        bytes32 nameHash = keccak256(bytes(name));
        if (!_ownsNameHash[addr][nameHash]) {
            return;
        }

        string[] storage owned = _ownedNames[addr];
        for (uint256 i = 0; i < owned.length; i++) {
            if (keccak256(bytes(owned[i])) == nameHash) {
                owned[i] = owned[owned.length - 1];
                owned.pop();
                break;
            }
        }

        _ownsNameHash[addr][nameHash] = false;
    }

    function _equals(string memory a, string calldata b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
