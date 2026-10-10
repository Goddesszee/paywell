// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract NANNameRegistry {

    address public immutable USDC;
    address public owner;

    uint256 public price1Yr = 2000000;
    uint256 public price2Yr = 3000000;
    uint256 public price5Yr = 8000000;

    struct NameRecord {
        address owner;
        uint256 expiry;
        uint256 registered;
    }

    mapping(string => NameRecord) public names;
    mapping(address => string[]) public ownerNames;
    string[] public allNames;

    event NameRegistered(string name, address indexed owner, uint256 expiry, uint256 pricePaid);
    event NameRenewed(string name, address indexed owner, uint256 newExpiry);

    constructor(address _usdc) {
        USDC = _usdc;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function register(string calldata name, uint8 duration) external {
        require(duration == 1 || duration == 2 || duration == 5, "Choose 1, 2, or 5");
        require(_validName(name), "Invalid name");
        require(bytes(name).length >= 2, "Name too short");
        require(bytes(name).length <= 32, "Name too long");

        NameRecord storage rec = names[name];
        require(
            rec.owner == address(0) || block.timestamp > rec.expiry,
            "Name already taken"
        );

        uint256 price;
        uint256 period;
        if (duration == 1) { price = price1Yr; period = 365 days; }
        else if (duration == 2) { price = price2Yr; period = 730 days; }
        else { price = price5Yr; period = 1825 days; }

        require(IERC20(USDC).transferFrom(msg.sender, address(this), price), "Payment failed");

        uint256 expiry = block.timestamp + period;

        if (rec.owner != address(0) && rec.owner != msg.sender) {
            _removeFromOwner(rec.owner, name);
        }

        names[name] = NameRecord({
            owner: msg.sender,
            expiry: expiry,
            registered: block.timestamp
        });

        if (rec.owner == address(0)) {
            allNames.push(name);
        }

        ownerNames[msg.sender].push(name);

        emit NameRegistered(name, msg.sender, expiry, price);
    }

    function renew(string calldata name, uint8 duration) external {
        require(duration == 1 || duration == 2 || duration == 5, "Choose 1, 2, or 5");
        NameRecord storage rec = names[name];
        require(rec.owner == msg.sender, "Not your name");

        uint256 price;
        uint256 period;
        if (duration == 1) { price = price1Yr; period = 365 days; }
        else if (duration == 2) { price = price2Yr; period = 730 days; }
        else { price = price5Yr; period = 1825 days; }

        require(IERC20(USDC).transferFrom(msg.sender, address(this), price), "Payment failed");

        uint256 base = rec.expiry > block.timestamp ? rec.expiry : block.timestamp;
        rec.expiry = base + period;

        emit NameRenewed(name, msg.sender, rec.expiry);
    }

    function resolve(string calldata name) external view returns (address) {
        NameRecord storage rec = names[name];
        if (rec.owner == address(0) || block.timestamp > rec.expiry) return address(0);
        return rec.owner;
    }

    function primaryName(address addr) external view returns (string memory) {
        string[] storage owned = ownerNames[addr];
        for (uint256 i = 0; i < owned.length; i++) {
            NameRecord storage rec = names[owned[i]];
            if (rec.owner == addr && block.timestamp <= rec.expiry) {
                return owned[i];
            }
        }
        return "";
    }

    function getNamesForAddress(address addr) external view returns (string[] memory) {
        return ownerNames[addr];
    }

    function getAllNames() external view returns (string[] memory) {
        return allNames;
    }

    function totalNames() external view returns (uint256) {
        return allNames.length;
    }

    function isAvailable(string calldata name) external view returns (bool) {
        NameRecord storage rec = names[name];
        return rec.owner == address(0) || block.timestamp > rec.expiry;
    }

    function updatePrices(uint256 p1, uint256 p2, uint256 p5) external onlyOwner {
        price1Yr = p1;
        price2Yr = p2;
        price5Yr = p5;
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(IERC20(USDC).transfer(to, amount), "Transfer failed");
    }

    function _validName(string calldata name) internal pure returns (bool) {
        bytes memory b = bytes(name);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool valid = (c >= 0x61 && c <= 0x7A) ||
                         (c >= 0x30 && c <= 0x39) ||
                         (c == 0x2D);
            if (!valid) return false;
        }
        return true;
    }

    function _removeFromOwner(address addr, string memory name) internal {
        string[] storage owned = ownerNames[addr];
        for (uint256 i = 0; i < owned.length; i++) {
            if (keccak256(bytes(owned[i])) == keccak256(bytes(name))) {
                owned[i] = owned[owned.length - 1];
                owned.pop();
                break;
            }
        }
    }
}
